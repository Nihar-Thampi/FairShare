import os
import uuid
import time
import json as json_mod
from flask import Blueprint, jsonify, request, current_app, g
from app.database import get_db
from app.services.ocr_service import preprocess_and_extract
from app.services.llm_service import (
    parse_receipt, fix_rupee_misread, merge_zero_price_fragments,
    filter_bogus_tax_lines, filter_total_lines, filter_optional_and_headers,
    deduplicate_items, fix_implausible_quantities, fix_quantity_from_totals,
    normalize_zero_unit_items, fix_unit_price_consistency,
    reattach_dropped_continuations, LLMTimeoutError, LLMParseError,
)
from app.services.invoice_service import merge_page_metadata
from app.middleware.auth import require_auth

ocr_bp = Blueprint("ocr", __name__)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "bmp", "tiff"}


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _find_cross_scan_dupes(items: list) -> list[int]:
    """Return IDs of items that are name-subsets of a longer item at the same price.

    Used to deduplicate across multiple upload sessions: if a previous scan already
    produced 'Lemon Chicken Boneless' and a new scan adds 'Lemon Chicken' at the
    same price, the shorter one is the stale duplicate.
    """
    to_remove: set[int] = set()
    for i, a in enumerate(items):
        if a["id"] in to_remove:
            continue
        name_a = str(a["name"]).strip().lower()
        price_a = float(a["total_price"] or 0)
        if price_a == 0:
            continue
        for j, b in enumerate(items):
            if j <= i or b["id"] in to_remove:
                continue
            name_b = str(b["name"]).strip().lower()
            price_b = float(b["total_price"] or 0)
            if price_a != price_b:
                continue
            if name_a in name_b and name_a != name_b:
                to_remove.add(a["id"])
            elif name_b in name_a and name_a != name_b:
                to_remove.add(b["id"])
    return list(to_remove)


@ocr_bp.route("/ocr/upload", methods=["POST"])
@require_auth
def upload_receipt():
    files = request.files.getlist("file")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No file(s) provided"}), 422

    for f in files:
        if not f.filename or not _allowed(f.filename):
            return jsonify({"error": "Invalid file type. Allowed: jpg, jpeg, png, webp, bmp, tiff"}), 422

    bill_id = request.form.get("bill_id")
    if not bill_id:
        return jsonify({"error": "bill_id is required"}), 422
    try:
        bill_id = int(bill_id)
    except ValueError:
        return jsonify({"error": "bill_id must be an integer"}), 422

    with get_db() as db:
        bill = db.execute(
            "SELECT * FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)
        ).fetchone()
        if not bill:
            return jsonify({"error": "Bill not found"}), 404

        upload_folder = current_app.config["UPLOAD_FOLDER"]
        saved_paths: list[str] = []
        filenames: list[str] = []
        for f in files:
            ext = f.filename.rsplit(".", 1)[1].lower()
            filename = f"bill_{bill_id}_{uuid.uuid4().hex}.{ext}"
            image_path = os.path.join(upload_folder, filename)
            f.save(image_path)
            saved_paths.append(image_path)
            filenames.append(filename)

        existing = bill["image_path"]
        try:
            paths = json_mod.loads(existing) if existing else []
            if not isinstance(paths, list):
                paths = [paths]
        except (TypeError, ValueError):
            paths = [existing] if existing else []
        paths.extend(filenames)

        db.execute(
            "UPDATE bills SET image_path = ?, status = 'ocr_pending', updated_at = datetime('now') WHERE id = ?",
            (json_mod.dumps(paths), bill_id)
        )

    # OCR each page outside the DB transaction to avoid long lock
    t_start = time.time()
    try:
        raw_parts: list[str] = []
        for i, img_path in enumerate(saved_paths):
            page_ocr = preprocess_and_extract(img_path)
            print(f"[OCR page {i + 1}/{len(saved_paths)}]\n{page_ocr}\n", flush=True)
            if page_ocr.strip():
                raw_parts.append(page_ocr)
        raw_ocr = "\n\n--- PAGE BREAK ---\n\n".join(raw_parts)
    except Exception as e:
        print(f"[OCR ERROR] {e}", flush=True)
        with get_db() as db:
            db.execute("UPDATE bills SET status = 'draft', updated_at = datetime('now') WHERE id = ?", (bill_id,))
        return jsonify({"error": f"OCR processing failed: {str(e)}"}), 500

    # LLM parse each page separately (combined context degrades quality)
    all_items: list[dict] = []
    all_tax: list[dict] = []
    raw_pages: list[dict] = []
    business_name: str | None = None

    for i, page_ocr in enumerate(raw_parts):
        try:
            print(f"[PIPELINE] Page {i + 1}/{len(raw_parts)} — {len(page_ocr)} chars", flush=True)
            _raw = parse_receipt(page_ocr)
            print(f"[PIPELINE] Page {i + 1} — {len(_raw.get('items', []))} items, {len(_raw.get('tax_lines', []))} tax", flush=True)
            for it in _raw.get("items", []):
                print(f"  item  {it.get('name')!r:40s}  qty={it.get('quantity')}  unit={it.get('unit_price')}  total={it.get('total_price')}", flush=True)

            raw_pages.append(_raw)
            if not business_name:
                business_name = _raw.get("business_name")

            _p = filter_total_lines(_raw)
            _p = filter_optional_and_headers(_p)
            _p = normalize_zero_unit_items(_p, ocr_text=page_ocr)
            _p = reattach_dropped_continuations(_p, ocr_text=page_ocr)
            _p = merge_zero_price_fragments(_p, ocr_text=page_ocr)
            _p = filter_bogus_tax_lines(_p)
            _p = fix_implausible_quantities(_p)
            _p = fix_rupee_misread(_p)
            _p = fix_unit_price_consistency(_p)
            _p = fix_quantity_from_totals(_p)

            all_items.extend(_p.get("items", []))
            all_tax.extend(_p.get("tax_lines", []))

        except LLMTimeoutError as e:
            print(f"[LLM TIMEOUT] page {i + 1}: {e}", flush=True)
            with get_db() as db:
                db.execute(
                    "UPDATE bills SET raw_ocr = ?, status = 'ocr_done', updated_at = datetime('now') WHERE id = ?",
                    (raw_ocr, bill_id)
                )
            return jsonify({"error": str(e), "raw_ocr": raw_ocr, "bill_id": bill_id}), 504
        except LLMParseError as e:
            print(f"[LLM ERROR] page {i + 1}: {e}", flush=True)
            with get_db() as db:
                db.execute(
                    "UPDATE bills SET raw_ocr = ?, status = 'ocr_done', updated_at = datetime('now') WHERE id = ?",
                    (raw_ocr, bill_id)
                )
            return jsonify({"error": str(e), "raw_ocr": raw_ocr, "bill_id": bill_id}), 500

    parsed = deduplicate_items({"business_name": business_name, "items": all_items, "tax_lines": all_tax})
    processing_ms = int((time.time() - t_start) * 1000)

    with get_db() as db:
        max_order = (
            db.execute("SELECT COALESCE(MAX(sort_order), -1) FROM bill_items WHERE bill_id = ?", (bill_id,))
            .fetchone()[0] + 1
        )

        items_to_insert = []
        for item in parsed.get("items", []):
            qty = float(item.get("quantity") or 1)
            unit = float(item.get("unit_price") or 0)
            total = float(item.get("total_price") or round(qty * unit, 2))
            items_to_insert.append((bill_id, str(item.get("name", "Unknown item")).strip(), qty, unit, total, 0, max_order))
            max_order += 1
        for tax in parsed.get("tax_lines", []):
            total = float(tax.get("total_price") or 0)
            items_to_insert.append((bill_id, str(tax.get("name", "Tax")).strip(), 1.0, total, total, 1, max_order))
            max_order += 1

        db.executemany(
            "INSERT INTO bill_items (bill_id, name, quantity, unit_price, total_price, is_tax_line, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
            items_to_insert
        )

        all_bill_items = db.execute(
            "SELECT id, name, total_price FROM bill_items WHERE bill_id = ? AND is_tax_line = 0", (bill_id,)
        ).fetchall()
        dupe_ids = _find_cross_scan_dupes([dict(r) for r in all_bill_items])
        if dupe_ids:
            print(f"[PIPELINE] Cross-scan dedup: removing {len(dupe_ids)} duplicate(s)", flush=True)
            db.execute(
                f"DELETE FROM bill_items WHERE id IN ({','.join('?' * len(dupe_ids))})",
                dupe_ids
            )

        # Invoice header fields only fill blanks, so a later scan never overwrites
        # values the user has already entered or corrected.
        meta = merge_page_metadata(raw_pages)
        db.execute(
            """UPDATE bills SET
               raw_ocr = ?, llm_output = ?,
               name = CASE WHEN name = 'Unnamed Bill' AND ? IS NOT NULL THEN ? ELSE name END,
               vendor_name     = COALESCE(vendor_name, ?),
               invoice_number  = COALESCE(invoice_number, ?),
               invoice_date    = COALESCE(invoice_date, ?),
               due_date        = COALESCE(due_date, ?),
               currency        = COALESCE(currency, ?),
               extracted_total = COALESCE(extracted_total, ?),
               status = 'ocr_done', updated_at = datetime('now')
               WHERE id = ?""",
            (raw_ocr, json_mod.dumps(parsed), business_name, business_name,
             meta["vendor_name"], meta["invoice_number"], meta["invoice_date"],
             meta["due_date"], meta["currency"], meta["extracted_total"], bill_id)
        )

        items = db.execute(
            "SELECT * FROM bill_items WHERE bill_id = ? ORDER BY sort_order", (bill_id,)
        ).fetchall()
        bill = db.execute("SELECT * FROM bills WHERE id = ?", (bill_id,)).fetchone()

    return jsonify({
        "bill_id": bill_id,
        "business_name": business_name,
        "items": [dict(i) for i in items],
        "bill": dict(bill),
        "raw_ocr": raw_ocr,
        "processing_time_ms": processing_ms,
    }), 200
