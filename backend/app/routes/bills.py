import json as json_mod
from flask import Blueprint, jsonify, request, g, send_from_directory
from app.database import get_db
from app.middleware.auth import require_auth
from app.config import UPLOAD_FOLDER

bills_bp = Blueprint("bills", __name__)


def _owned_bill(db, bill_id: int, user_id: int):
    return db.execute("SELECT * FROM bills WHERE id = ? AND user_id = ?", (bill_id, user_id)).fetchone()


@bills_bp.route("/bills", methods=["GET"])
@require_auth
def list_bills():
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM bills WHERE user_id = ? ORDER BY created_at DESC", (g.user_id,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@bills_bp.route("/bills", methods=["POST"])
@require_auth
def create_bill():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "Unnamed Bill").strip() or "Unnamed Bill"
    with get_db() as db:
        cur = db.execute("INSERT INTO bills (name, user_id) VALUES (?, ?)", (name, g.user_id))
        bill = db.execute("SELECT * FROM bills WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(bill)), 201


@bills_bp.route("/bills/<int:bill_id>", methods=["GET"])
@require_auth
def get_bill(bill_id):
    with get_db() as db:
        bill = _owned_bill(db, bill_id, g.user_id)
        if not bill:
            return jsonify({"error": "Bill not found"}), 404
        items = db.execute(
            "SELECT * FROM bill_items WHERE bill_id = ? ORDER BY sort_order, id", (bill_id,)
        ).fetchall()
    result = dict(bill)
    result["items"] = [dict(i) for i in items]
    return jsonify(result)


@bills_bp.route("/bills/<int:bill_id>", methods=["PATCH"])
@require_auth
def update_bill(bill_id):
    data = request.get_json(silent=True) or {}
    with get_db() as db:
        bill = _owned_bill(db, bill_id, g.user_id)
        if not bill:
            return jsonify({"error": "Bill not found"}), 404

        fields, values = [], []
        if "name" in data:
            fields.append("name = ?")
            values.append(data["name"].strip() or "Unnamed Bill")
        if "status" in data:
            valid = {"draft", "ocr_pending", "ocr_done", "assigned", "calculated"}
            if data["status"] not in valid:
                return jsonify({"error": f"Invalid status. Must be one of {valid}"}), 422
            fields.append("status = ?")
            values.append(data["status"])

        if fields:
            fields.append("updated_at = datetime('now')")
            values.append(bill_id)
            db.execute(f"UPDATE bills SET {', '.join(fields)} WHERE id = ?", values)

        bill = db.execute("SELECT * FROM bills WHERE id = ?", (bill_id,)).fetchone()
    return jsonify(dict(bill))


@bills_bp.route("/bills/<int:bill_id>", methods=["DELETE"])
@require_auth
def delete_bill(bill_id):
    import os
    with get_db() as db:
        bill = _owned_bill(db, bill_id, g.user_id)
        if not bill:
            return jsonify({"error": "Bill not found"}), 404
        try:
            paths = json_mod.loads(bill["image_path"]) if bill["image_path"] else []
            if not isinstance(paths, list):
                paths = [paths]
        except (TypeError, ValueError):
            paths = []

        # Delete leaf rows first, then parent rows, so no FK constraint can block.
        db.execute(
            """DELETE FROM item_assignments WHERE item_id IN (
                   SELECT id FROM bill_items WHERE bill_id = ?
               )""", (bill_id,)
        )
        db.execute("DELETE FROM bill_items WHERE bill_id = ?", (bill_id,))
        db.execute("DELETE FROM calculation_results WHERE bill_id = ?", (bill_id,))
        db.execute("DELETE FROM persons WHERE bill_id = ?", (bill_id,))
        db.execute("DELETE FROM bills WHERE id = ?", (bill_id,))

    for filename in paths:
        try:
            os.remove(os.path.join(UPLOAD_FOLDER, filename))
        except OSError:
            pass

    return "", 204


@bills_bp.route("/bills/<int:bill_id>/images/<string:filename>", methods=["GET"])
@require_auth
def get_bill_image(bill_id, filename):
    with get_db() as db:
        bill = _owned_bill(db, bill_id, g.user_id)
        if not bill:
            return jsonify({"error": "Bill not found"}), 404
        try:
            paths = json_mod.loads(bill["image_path"]) if bill["image_path"] else []
            if not isinstance(paths, list):
                paths = [paths]
        except (TypeError, ValueError):
            paths = []
        if filename not in paths:
            return jsonify({"error": "Image not found"}), 404
    return send_from_directory(UPLOAD_FOLDER, filename)


@bills_bp.route("/bills/<int:bill_id>/images/<string:filename>", methods=["PUT"])
@require_auth
def replace_bill_image(bill_id, filename):
    """Overwrite a stored image file without changing its name or re-running OCR."""
    with get_db() as db:
        bill = _owned_bill(db, bill_id, g.user_id)
        if not bill:
            return jsonify({"error": "Bill not found"}), 404
        try:
            paths = json_mod.loads(bill["image_path"]) if bill["image_path"] else []
            if not isinstance(paths, list):
                paths = [paths]
        except (TypeError, ValueError):
            paths = []
        if filename not in paths:
            return jsonify({"error": "Image not found"}), 404

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file provided"}), 422

    import os
    file.save(os.path.join(UPLOAD_FOLDER, filename))
    return jsonify(dict(bill))


@bills_bp.route("/bills/<int:bill_id>/images/<string:filename>", methods=["DELETE"])
@require_auth
def delete_bill_image(bill_id, filename):
    with get_db() as db:
        bill = _owned_bill(db, bill_id, g.user_id)
        if not bill:
            return jsonify({"error": "Bill not found"}), 404
        try:
            paths = json_mod.loads(bill["image_path"]) if bill["image_path"] else []
            if not isinstance(paths, list):
                paths = [paths]
        except (TypeError, ValueError):
            paths = []
        if filename not in paths:
            return jsonify({"error": "Image not found"}), 404

        paths.remove(filename)
        new_path = json_mod.dumps(paths) if paths else None
        db.execute(
            "UPDATE bills SET image_path = ?, updated_at = datetime('now') WHERE id = ?",
            (new_path, bill_id)
        )
        bill = db.execute("SELECT * FROM bills WHERE id = ?", (bill_id,)).fetchone()

    # Remove file from disk (non-fatal if already gone)
    import os
    try:
        os.remove(os.path.join(UPLOAD_FOLDER, filename))
    except OSError:
        pass

    return jsonify(dict(bill))


@bills_bp.route("/bills/<int:bill_id>/items", methods=["GET"])
@require_auth
def list_items(bill_id):
    with get_db() as db:
        if not _owned_bill(db, bill_id, g.user_id):
            return jsonify({"error": "Bill not found"}), 404
        items = db.execute(
            "SELECT * FROM bill_items WHERE bill_id = ? ORDER BY sort_order, id", (bill_id,)
        ).fetchall()
    return jsonify([dict(i) for i in items])


@bills_bp.route("/bills/<int:bill_id>/items", methods=["POST"])
@require_auth
def add_item(bill_id):
    with get_db() as db:
        if not _owned_bill(db, bill_id, g.user_id):
            return jsonify({"error": "Bill not found"}), 404

        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 422

        try:
            quantity = float(data.get("quantity", 1))
            unit_price = float(data.get("unit_price", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "quantity and unit_price must be numbers"}), 422

        total_price = round(quantity * unit_price, 2)
        is_tax_line = 1 if data.get("is_tax_line") else 0
        max_order = db.execute(
            "SELECT COALESCE(MAX(sort_order), 0) FROM bill_items WHERE bill_id = ?", (bill_id,)
        ).fetchone()[0]

        cur = db.execute(
            """INSERT INTO bill_items (bill_id, name, quantity, unit_price, total_price, is_tax_line, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (bill_id, name, quantity, unit_price, total_price, is_tax_line, max_order + 1)
        )
        item = db.execute("SELECT * FROM bill_items WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(item)), 201


@bills_bp.route("/bills/<int:bill_id>/items", methods=["DELETE"])
@require_auth
def clear_items(bill_id):
    import os
    with get_db() as db:
        bill = _owned_bill(db, bill_id, g.user_id)
        if not bill:
            return jsonify({"error": "Bill not found"}), 404
        try:
            paths = json_mod.loads(bill["image_path"]) if bill["image_path"] else []
            if not isinstance(paths, list):
                paths = [paths]
        except (TypeError, ValueError):
            paths = []

        db.execute(
            """DELETE FROM item_assignments WHERE item_id IN (
                   SELECT id FROM bill_items WHERE bill_id = ?
               )""", (bill_id,)
        )
        db.execute("DELETE FROM bill_items WHERE bill_id = ?", (bill_id,))
        db.execute("DELETE FROM calculation_results WHERE bill_id = ?", (bill_id,))
        db.execute(
            "UPDATE bills SET image_path = NULL, status = 'draft', updated_at = datetime('now') WHERE id = ?",
            (bill_id,)
        )

    for filename in paths:
        try:
            os.remove(os.path.join(UPLOAD_FOLDER, filename))
        except OSError:
            pass

    return "", 204


@bills_bp.route("/items/<int:item_id>", methods=["PATCH"])
@require_auth
def update_item(item_id):
    with get_db() as db:
        item = db.execute(
            """SELECT bi.* FROM bill_items bi
               JOIN bills b ON b.id = bi.bill_id
               WHERE bi.id = ? AND b.user_id = ?""",
            (item_id, g.user_id)
        ).fetchone()
        if not item:
            return jsonify({"error": "Item not found"}), 404

        data = request.get_json(silent=True) or {}
        fields, values = [], []

        if "name" in data:
            name = data["name"].strip()
            if not name:
                return jsonify({"error": "name cannot be empty"}), 422
            fields.append("name = ?")
            values.append(name)
        if "quantity" in data:
            fields.append("quantity = ?")
            values.append(float(data["quantity"]))
        if "unit_price" in data:
            fields.append("unit_price = ?")
            values.append(float(data["unit_price"]))
        if "is_tax_line" in data:
            fields.append("is_tax_line = ?")
            values.append(1 if data["is_tax_line"] else 0)

        if fields:
            current = dict(item)
            qty = float(data.get("quantity", current["quantity"]))
            price = float(data.get("unit_price", current["unit_price"]))
            fields.append("total_price = ?")
            values.append(round(qty * price, 2))
            values.append(item_id)
            db.execute(f"UPDATE bill_items SET {', '.join(fields)} WHERE id = ?", values)

        item = db.execute("SELECT * FROM bill_items WHERE id = ?", (item_id,)).fetchone()
    return jsonify(dict(item))


@bills_bp.route("/items/<int:item_id>", methods=["DELETE"])
@require_auth
def delete_item(item_id):
    with get_db() as db:
        item = db.execute(
            """SELECT bi.id FROM bill_items bi
               JOIN bills b ON b.id = bi.bill_id
               WHERE bi.id = ? AND b.user_id = ?""",
            (item_id, g.user_id)
        ).fetchone()
        if not item:
            return jsonify({"error": "Item not found"}), 404
        db.execute("DELETE FROM bill_items WHERE id = ?", (item_id,))
    return "", 204
