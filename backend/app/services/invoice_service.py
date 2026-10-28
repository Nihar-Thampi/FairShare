import re
from datetime import date

PAYMENT_STATUSES = {"unpaid", "paid"}

# Free-text invoice fields a user can edit, with their maximum length.
TEXT_FIELDS = {
    "vendor_name": 200,
    "invoice_number": 100,
    "category": 60,
    "notes": 2000,
}
DATE_FIELDS = ("invoice_date", "due_date", "paid_at")

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


class InvoiceFieldError(ValueError):
    pass


def parse_iso_date(value) -> str | None:
    """Return value as a YYYY-MM-DD string, or None if it is not a real date."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    try:
        return date.fromisoformat(value).isoformat() if len(value) == 10 else None
    except ValueError:
        return None


def normalize_currency(value) -> str | None:
    if not isinstance(value, str):
        return None
    code = value.strip().upper()
    return code if _CURRENCY_RE.match(code) else None


def _clean_text(value, max_len: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:max_len] or None


def _to_amount(value) -> float | None:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return round(amount, 2) if amount > 0 else None


def merge_page_metadata(pages: list[dict]) -> dict:
    """Combine invoice header fields from each parsed page into one record.

    Header fields (vendor, number, dates, currency) are taken from the first page
    that has them. The printed grand total is taken from the last page that has one,
    because multi-page invoices print it at the end. Values the LLM returned in the
    wrong shape (e.g. "12/03/2026" instead of an ISO date) are dropped rather than guessed.
    """
    merged = {
        "vendor_name": None,
        "invoice_number": None,
        "invoice_date": None,
        "due_date": None,
        "currency": None,
        "extracted_total": None,
    }
    for page in pages:
        candidates = {
            "vendor_name": _clean_text(page.get("business_name"), TEXT_FIELDS["vendor_name"]),
            "invoice_number": _clean_text(page.get("invoice_number"), TEXT_FIELDS["invoice_number"]),
            "invoice_date": parse_iso_date(page.get("invoice_date")),
            "due_date": parse_iso_date(page.get("due_date")),
            "currency": normalize_currency(page.get("currency")),
        }
        for key, value in candidates.items():
            if merged[key] is None and value is not None:
                merged[key] = value
        total = _to_amount(page.get("grand_total"))
        if total is not None:
            merged["extracted_total"] = total
    return merged


def validate_invoice_update(data: dict) -> dict:
    """Validate the invoice fields of a PATCH body and return the columns to update.

    Raises InvoiceFieldError with a user-facing message on invalid input. Empty
    strings clear a field. Marking an invoice paid without a paid_at date records today.
    """
    updates: dict = {}

    for field, max_len in TEXT_FIELDS.items():
        if field in data:
            updates[field] = _clean_text(data[field], max_len)

    for field in DATE_FIELDS:
        if field in data:
            raw = data[field]
            if raw in (None, ""):
                updates[field] = None
                continue
            parsed = parse_iso_date(raw)
            if parsed is None:
                raise InvoiceFieldError(f"{field} must be a date in YYYY-MM-DD format")
            updates[field] = parsed

    if "currency" in data:
        raw = data["currency"]
        if raw in (None, ""):
            updates["currency"] = None
        else:
            code = normalize_currency(raw)
            if code is None:
                raise InvoiceFieldError("currency must be a 3-letter ISO code, e.g. INR or USD")
            updates["currency"] = code

    if "payment_status" in data:
        status = data["payment_status"]
        if status not in PAYMENT_STATUSES:
            raise InvoiceFieldError(f"payment_status must be one of {sorted(PAYMENT_STATUSES)}")
        updates["payment_status"] = status
        if status == "unpaid":
            updates["paid_at"] = None
        elif not updates.get("paid_at"):
            updates["paid_at"] = date.today().isoformat()

    return updates
