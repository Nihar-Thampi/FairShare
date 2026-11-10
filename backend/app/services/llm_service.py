import re
import json
from openai import OpenAI
from app.config import OPENAI_API_KEY, OPENAI_MODEL


class LLMTimeoutError(Exception):
    pass


class LLMParseError(Exception):
    pass


SYSTEM_PROMPT = """You are a bill parsing assistant. You receive raw OCR text from one page of a bill or receipt.
The bill may be from any context: restaurant, grocery, hotel, bar, pharmacy, retail, utility, or any other.
The text may contain OCR errors: letters substituted for numbers (l for 1, O for 0), missing spaces,
garbled words, or duplicate lines. Your job is to extract all line items into clean structured JSON.

Every bill page starts with a header block and ends with a footer block. Both must be completely
ignored. HEADER: business name, address, phone, email, website, tagline/slogan, table/room/order
number, date, time, bill/invoice/receipt number, staff name, "powered by"/"digitized by" software
name, column labels (e.g. "Item", "Qty", "Rate", "Amount", "S.No", "No", "Price", "Description"),
and any reference to a previous bill or previous visits. FOOTER: same types of text — website URLs,
software name, marketing slogans, loyalty program links, customer feedback requests, QR code text.
TOTALS AND SUMMARIES: Sub Total, Subtotal, Grand Total, Total, Bill Total, Net Total, Total Amount,
Amount Due, Balance Due, Amount Payable, Net Amount — any line that sums up previously listed items
— must be completely excluded (neither as an item nor as a tax line). When a tilted or rotated
receipt causes OCR to merge such a keyword with an item name onto one line (e.g. "Birria Taco
Sub Total 4905"), extract the item name only with total_price=0; NEVER use the summary figure
as that item's price.
OPTIONAL CHARGES: Any charge explicitly marked "(Optional)", "optional", "at your discretion",
or "suggested" — such as "Staff Gratuity (Optional)", "Suggested Tip", "Voluntary Service Charge"
— is discretionary and must be completely excluded. Do not include it as an item or a tax line.
SECTION HEADERS: Labels that introduce a group of lines rather than charging for anything —
"Tax Summary", "Food Total", "Beverage Total", "Tax Total", "Item Summary", "Bill Summary",
"Total Qty", "Staff Gra" (gratuity header) — must be completely excluded. They are organisational
headings, not charges. Never assign their associated numbers to a line item.
Extract ONLY what is between: the line items and any tax/charge lines.

Rules:
1. Include every line item and monetary charge present in the bill. Skip only HEADER and FOOTER
   lines as defined above. Every other line that contains numbers matching the price pattern
   (rule 4) is a line item and must be included — even if the name is unfamiliar, abbreviated,
   a local brand, a foreign word, or a term you do not recognise. Never skip a priced line
   because its name seems unusual.
2. TAX LINES: Only government tax entries (GST, CGST, SGST, IGST, VAT, service tax, cess, or any
   line explicitly labelled "tax") go into tax_lines with is_tax_line=true. A valid tax_line MUST
   have a non-zero total_price. All other charges (delivery fees, service charges, packing,
   handling, convenience fees, etc.) are regular items (is_tax_line=false). Do NOT put any
   $0 line in tax_lines.
3. Do NOT invent data. A line with NO numeric tokens (zero digits anywhere on it) MUST have
   total_price=0, unit_price=0, quantity=1. Never borrow a price from an adjacent line for a
   zero-number line.
4. Quantity and price detection — read the numbers at the end of each line:
   - A number immediately followed by a unit abbreviation (ml, L, Ltr, kg, g, Pcs, Nos, oz, fl oz)
     is a volume/weight/quantity descriptor, not a price — include it in the item name but do not
     use it as a price.
   - 3 numbers [Q][R][T]: verify Q × R ≈ T; if so qty=Q, unit_price=R, total_price=T.
   - 2 numbers [R][T]: compute T ÷ R. If the result is a whole number 1–8, set qty=T÷R,
     unit_price=R, total_price=T. Otherwise qty=1, unit_price=T, total_price=T.
   - 1 number: total_price=that number, unit_price=total_price, qty=1.
   - 0 numbers: total_price=0, unit_price=0, qty=1.
   - Quantities are always small integers 1–10.
5. Correct obvious OCR character errors in prices (e.g. "l" → "1", "O" → "0", "S" → "5").
6. Strip any leading serial number from item names (e.g. "3 Item" → "Item", "12.Mk Service Fee" → "Service Fee").
7. Multi-line item names: some item names wrap across two or more physical lines, with the price
   only on the first line. Any line that has 0 numbers AND is not clearly non-item text is a
   name continuation of the nearest priced item. Append it to the preceding priced item's name,
   or prepend it to the following priced item's name if it comes first. You MUST include the
   fragment text in the merged name — never silently discard it. Any word or phrase on its own
   line that qualifies, describes, or completes the item above it (a size, a variant, a type,
   a model, a specification, a brand suffix) is always a name continuation, not a section header.
   Never emit the fragment as a separate item. Never emit both a merged name and its fragments —
   each item appears exactly once.
   Ignore (do not merge) only: URLs, slogans, software names, bill reference numbers, and
   column-label lines (lines whose words are all table-header labels like "No", "Item", "Qty",
   "Rate", "Price", "Amount", "Description").
8. Return ONLY valid JSON matching the schema below. No markdown, no explanation, no extra text.
9. Completeness check: before finalising your output, verify that every non-header/footer line
   containing numbers has produced exactly one item in the output. A name you do not recognise
   is never a reason to omit an entry.
10. INVOICE DETAILS: header and footer lines are never items, but report these values in the
   top-level fields of the schema. Use null for anything not printed on this page; never guess.
   - invoice_number: the bill/invoice/receipt number exactly as printed (not a table or order number).
   - invoice_date / due_date: ISO format YYYY-MM-DD. Only fill due_date from an explicit
     "Due", "Due date" or "Pay by" label.
   - currency: ISO 4217 code from the currency symbol or label (₹/Rs → INR, € → EUR, £ → GBP,
     $ → USD unless the text says otherwise).
   - grand_total: the final amount payable printed on the bill (Grand Total, Total, Amount Due).
   - subtotal: the printed subtotal before tax, if any."""

OUTPUT_SCHEMA = """{
  "business_name": "string or null",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "currency": "ISO 4217 code or null",
  "items": [
    {
      "name": "string",
      "quantity": number,
      "unit_price": number,
      "total_price": number,
      "is_tax_line": false
    }
  ],
  "tax_lines": [
    {
      "name": "string",
      "total_price": number,
      "is_tax_line": true
    }
  ],
  "subtotal": number or null,
  "grand_total": number or null
}"""


_openai_client: OpenAI | None = None


def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


def parse_receipt(raw_ocr: str) -> dict:
    """Send raw OCR text to OpenAI and return parsed receipt JSON."""
    user_msg = f"Parse this bill OCR text into JSON.\n\nOCR TEXT:\n{raw_ocr}\n\nReturn this exact JSON structure:\n{OUTPUT_SCHEMA}"

    result = _call_openai(SYSTEM_PROMPT, user_msg)
    parsed = _extract_json(result)
    if parsed is not None:
        return parsed

    print(f"[LLM] First parse failed ({len(result)} chars), retrying with fix prompt...", flush=True)
    fix_msg = f"The following text is supposed to be JSON but is malformed. Fix it and return ONLY valid JSON:\n\n{result}"
    result = _call_openai("You are a JSON repair assistant. Return only valid JSON.", fix_msg)
    parsed = _extract_json(result)
    if parsed is not None:
        return parsed

    raise LLMParseError("OpenAI returned output that could not be parsed as JSON after two attempts.")


def _call_openai(system_prompt: str, user_prompt: str) -> str:
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=4096,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        msg = str(e)
        raise LLMTimeoutError(f"OpenAI API error: {msg}")


def _extract_json(text: str) -> dict | None:
    """Extract the first JSON object from a string, handling markdown fences."""
    # Strip markdown code fences if present
    text = re.sub(r'^```(?:json)?\s*', '', text.strip(), flags=re.IGNORECASE)
    text = re.sub(r'\s*```$', '', text.strip())

    # Try parsing the whole cleaned string first
    try:
        result = json.loads(text.strip())
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    # Fall back: extract the first {...} block
    match = re.search(r'\{[\s\S]*\}', text)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


def fix_rupee_misread(parsed: dict) -> dict:
    """Detect and fix the EasyOCR ₹→2 misread pattern.

    The arithmetic-consistency approach fails when the LLM computes the total
    from the already-misread unit price (e.g. 2305 × 2 = 4610 looks consistent
    even though both values are wrong). Instead we use a voting approach:

    - Count how many non-zero unit prices start with '2'
    - If at least 2 items AND ≥ 50 % of priced items start with '2', treat the
      whole receipt as a ₹ misread receipt
    - Strip the leading '2' from every unit price and recompute the total
    """
    items = parsed.get("items", [])
    priced = [i for i in items if float(i.get("unit_price") or 0) > 0]
    if not priced:
        return parsed

    def _starts_with_2(v: float) -> bool:
        return str(int(v) if v == int(v) else v).startswith('2')

    def _strip2(v: float) -> float:
        s = str(int(v)) if v == int(v) else str(v)
        return float(s[1:]) if s.startswith('2') and len(s) > 1 else v

    votes = sum(1 for i in priced if _starts_with_2(float(i.get("unit_price") or 0)))
    if votes < 2 or votes / len(priced) < 0.8:
        return parsed

    for item in items:
        unit = float(item.get("unit_price") or 0)
        qty = float(item.get("quantity") or 1)
        if unit > 0:
            new_unit = _strip2(unit)
            item["unit_price"] = new_unit
            item["total_price"] = round(new_unit * qty, 2)

    return parsed


_BRANDING_PAT = re.compile(
    # URLs and domains
    r'www\.'
    r'|\.(com|in|co\.in|net|org|io|app|biz|info)\b'
    # Email addresses (full form — bare "@" like "CGST@ 5%" must NOT match)
    r'|\w{2,}@\w{2,}\.\w{2,}'
    # "Powered by / Digitized by / Managed by <software>" — generic POS attribution
    r'|\b(powered|digitized|managed|built|created)\s+by\b'
    # Bill/invoice/receipt reference numbers
    r'|\b(bill|invoice|receipt|order)\s*(no\.?|number|#|:)\s*\d'
    # "Previous visit(s)" header decoration
    r'|\bprevious\s+visit'
    # Loyalty / reward programme text
    r'|\b(loyalty|reward|redeem|earn\s+point|cashback)\b'
    # Customer feedback / review requests
    r'|\b(feedback|rate\s+us|review\s+us|tell\s+us)\b',
    re.IGNORECASE,
)


def _is_branding(name: str) -> bool:
    return bool(_BRANDING_PAT.search(name))


def merge_zero_price_fragments(parsed: dict, ocr_text: str = "") -> dict:
    """Merge $0-price items into their adjacent priced neighbour.

    Receipts wrap long item names across lines; each fragment gets its own OCR
    block. The LLM should handle this, but if it still emits $0 items this
    pass cleans them up deterministically.

    $0 items that match restaurant branding/footer patterns are dropped outright
    rather than merged into a food item name.

    $0 items whose OCR line contained digits are "price unknown" items (e.g. an
    item whose price line was obscured by a Sub Total merge) — kept as-is so the
    user can manually fill in the price, never silently merged into a neighbour.
    """
    items = parsed.get("items", [])
    if not items:
        return parsed

    merged: list[dict] = []
    i = 0
    while i < len(items):
        item = items[i]
        if float(item.get("total_price") or 0) == 0 and not item.get("is_tax_line"):
            fragment_name = str(item.get("name", "")).strip()
            # Drop footer/branding text entirely — never merge into a food item
            if _is_branding(fragment_name):
                i += 1
                continue
            # If the OCR line had numbers the price was obscured (e.g. Sub Total
            # merged onto this line) — keep the item separate so the user can
            # enter the correct price manually
            if ocr_text and _ocr_line_has_price(fragment_name, ocr_text):
                merged.append(item)
                i += 1
                continue
            preceding_is_priced = merged and float(merged[-1].get("total_price") or 0) != 0
            following_is_priced = (
                i + 1 < len(items) and float(items[i + 1].get("total_price") or 0) != 0
            )
            if preceding_is_priced:
                existing = merged[-1]["name"]
                # Only append if the fragment isn't already part of the name (LLM may have pre-merged)
                if fragment_name.lower() not in existing.lower():
                    merged[-1]["name"] = (existing + " " + fragment_name).strip()
                # Either way, don't emit the $0 item separately
            elif following_is_priced:
                next_name = str(items[i + 1].get("name", ""))
                if fragment_name.lower() not in next_name.lower():
                    items[i + 1]["name"] = (fragment_name + " " + next_name).strip()
            else:
                # Isolated $0 item with no priced neighbour — keep so nothing is lost
                merged.append(item)
        else:
            merged.append(item)
        i += 1

    parsed["items"] = merged
    return parsed


def filter_bogus_tax_lines(parsed: dict) -> dict:
    """Remove tax_lines that are restaurant footer/branding text rather than actual charges.

    Real tax and service charge lines always have a non-zero total. $0 entries are
    always footer text. Lines whose name matches URL, app, or bill-reference patterns
    are also dropped regardless of price.
    """
    filtered = [
        tax for tax in parsed.get("tax_lines", [])
        if float(tax.get("total_price") or 0) != 0
        and not _is_branding(str(tax.get("name", "")))
    ]
    parsed["tax_lines"] = filtered
    return parsed


_OPTIONAL_PAT = re.compile(
    r'\(optional\)'
    r'|\boptional\b'
    r'|\bsuggested\s+tip\b'
    r'|\bvoluntary\b'
    r'|\bat\s+your\s+discretion\b',
    re.IGNORECASE,
)

_SECTION_HEADER_PAT = re.compile(
    r'\btax\s+summary\b'
    r'|\bfood\s+(?:total|sub.?total)\b'
    r'|\bbeverage\s+(?:total|sub.?total)\b'
    r'|\bdrink\s+(?:total|sub.?total)\b'
    r'|\btax\s+total\b'
    r'|\bitem\s+(?:summary|total)\b'
    r'|\bbill\s+summary\b'
    r'|\btotal\s+qty\b'
    r'|\bstaff\s+gra(?:tuity)?\b'   # "Staff Gratuity" header (the actual charge has "(Optional)")
    r'|\brate\s+a(?:mount|mt)\b'    # "Rate Amount" column header
    r'|\bqty\s+rate\b',             # "Qty Rate" column header
    re.IGNORECASE,
)


def filter_optional_and_headers(parsed: dict) -> dict:
    """Remove optional charges and section-header pseudo-items.

    Two categories:
    - OPTIONAL: any item whose name contains "(Optional)", "optional", "suggested tip",
      etc. These are discretionary — the customer may or may not pay them — and must
      never be included in a mandatory bill split.
    - SECTION HEADERS: labels like "Tax Summary", "Food Total", "Beverage Total",
      "Total Qty", "Staff Gratuity" (the header row, not the actual charge) that
      organise the receipt layout but are not charges. Including them would
      double-count amounts already listed elsewhere.

    Both categories are removed from items and tax_lines.
    """
    def _is_excluded(name: str) -> bool:
        return bool(_OPTIONAL_PAT.search(name) or _SECTION_HEADER_PAT.search(name))

    before = len(parsed.get("items", []))
    parsed["items"] = [
        item for item in parsed.get("items", [])
        if not _is_excluded(str(item.get("name", "")))
    ]
    parsed["tax_lines"] = [
        tax for tax in parsed.get("tax_lines", [])
        if not _is_excluded(str(tax.get("name", "")))
    ]
    removed = before - len(parsed["items"])
    if removed:
        print(f"[filter_optional_and_headers] removed {removed} item(s)", flush=True)
    return parsed


def fix_implausible_quantities(parsed: dict) -> dict:
    """Correct items where qty > 20, which is never realistic for a restaurant.

    When OCR merges a qty digit and a price digit (e.g. '2' + '130' → '2130'
    misread as qty=2130 or qty=230), the LLM can produce arithmetic that checks
    out (230 × 1.13 ≈ 260) but the quantity is nonsense.  We try small qtys
    (1–5) and pick the one whose implied unit_price is a 'clean' number.
    """
    for item in parsed.get("items", []):
        qty = float(item.get("quantity") or 1)
        total = float(item.get("total_price") or 0)
        if total <= 0 or qty <= 20:
            continue
        for tq in [1, 2, 3, 4, 5]:
            tu = total / tq
            frac = tu % 1
            # Prefer integer, .5, or .25 unit prices
            if tu >= 1 and (frac < 0.05 or frac > 0.95 or abs(frac - 0.5) < 0.05):
                item["quantity"] = float(tq)
                item["unit_price"] = round(tu, 2)
                break
    return parsed


_HAS_DIGIT = re.compile(r'\d')

_TOTAL_LINE_PAT = re.compile(
    r'\b(sub[-\s]?total|grand[-\s]?total|bill[-\s]?total|net[-\s]?total|'
    r'total\s+amount|amount\s+total|total\s+due|amount\s+due|'
    r'amount\s+payable|balance\s+due|invoice\s+total|net\s+amount)\b',
    re.IGNORECASE
)


def filter_total_lines(parsed: dict) -> dict:
    """Remove items misidentified as subtotal/grand-total summary rows.

    Two cases handled:
    1. Item name contains a subtotal/total keyword — always drop.
    2. Item price exactly matches the bill's extracted grand_total or subtotal — this
       is an OCR-merge artifact where a tilted receipt placed the summary row on the
       same text line as the last item, causing the LLM to assign the summary value
       to that item. Only applied when there are multiple priced items, so a single-
       item bill is never incorrectly filtered.
    """
    items = parsed.get("items", [])
    grand_total = parsed.get("grand_total")
    subtotal = parsed.get("subtotal")

    priced_count = sum(1 for i in items if float(i.get("total_price") or 0) > 0)

    def _is_total_row(item: dict) -> bool:
        name = str(item.get("name", ""))
        if _TOTAL_LINE_PAT.search(name):
            return True
        if priced_count <= 1:
            return False
        total = float(item.get("total_price") or 0)
        if total <= 0:
            return False
        if grand_total is not None and abs(total - float(grand_total)) < 0.5:
            return True
        if subtotal is not None and abs(total - float(subtotal)) < 0.5:
            return True
        return False

    filtered = [item for item in items if not _is_total_row(item)]
    removed = len(items) - len(filtered)
    if removed:
        print(f"[filter_total_lines] removed {removed} item(s) matching subtotal/grand-total", flush=True)
    parsed["items"] = filtered
    return parsed


def reattach_dropped_continuations(parsed: dict, ocr_text: str) -> dict:
    """Deterministic fix for name fragments the LLM silently dropped.

    Receipts often format multi-word item names across two lines:
        Paneer Ghee 265 265
        Roast
    The LLM should append "Roast" but sometimes doesn't. This function walks
    the raw OCR line-by-line: whenever a zero-number line immediately follows a
    priced line, it checks whether that word is already in the matched item's
    name and appends it if not.
    """
    if not ocr_text:
        return parsed
    items = parsed.get("items", [])
    if not items:
        return parsed

    lines = [l.strip() for l in ocr_text.splitlines() if l.strip()]

    for idx in range(1, len(lines)):
        line = lines[idx]
        # Must be a zero-number line and not branding/header text
        if _HAS_DIGIT.search(line) or _is_branding(line):
            continue
        prev = lines[idx - 1]
        # Previous line must have been a priced line
        if not _HAS_DIGIT.search(prev):
            continue
        # Extract the name prefix from the priced line (text before its first digit)
        first_digit = next((j for j, c in enumerate(prev) if c.isdigit()), None)
        if first_digit is None:
            continue
        prev_name = prev[:first_digit].strip().lower()
        if len(prev_name) < 3:
            continue

        continuation = line
        for item in items:
            name = item.get("name", "")
            if name.lower().startswith(prev_name) or prev_name in name.lower():
                if continuation.lower() not in name.lower():
                    item["name"] = (name + " " + continuation).strip()
                break

    return parsed


def _ocr_line_has_price(item_name: str, ocr_text: str) -> bool:
    """Return True if any OCR line mentioning this item contains a standalone
    number ≥ 10, meaning the line carried a real price/quantity.

    Used to distinguish:
      - LLM error: unit=0 but OCR line DID have numbers → keep the item priced
      - True fragment: unit=0 and OCR line had NO numbers → safe to zero & merge
    """
    words = [w.lower() for w in item_name.split() if len(w) > 2]
    if not words:
        return False
    for line in ocr_text.splitlines():
        ll = line.lower()
        if not any(w in ll for w in words):
            continue
        for tok in line.split():
            t = tok.replace(',', '').replace('.', '')
            if t.isdigit() and int(t) >= 10:
                return True
    return False


def normalize_zero_unit_items(parsed: dict, ocr_text: str = "") -> dict:
    """Zero out total_price only for items where unit_price=0 AND the OCR had
    no numbers on that item's line — these are true name-continuation fragments.

    Items where unit=0 but the OCR DID have numbers are left alone: the LLM
    forgot to assign a price, and fix_unit_price_consistency will repair the
    display without incorrectly merging the item into its neighbour.

    Example (zero & merge):  OCR "Prawn (8Pcs)" — no numbers → zero → merges
                              with preceding "Butter Garlic" → "Butter Garlic Prawn (8Pcs)"
    Example (leave alone):   OCR "Paneer Butter 245 490" — has numbers → keep
                              unit=0,total=490 → fix_unit_price_consistency → unit=490
    """
    for item in parsed.get("items", []):
        if item.get("is_tax_line"):
            continue
        if float(item.get("unit_price") or 0) != 0:
            continue
        name = str(item.get("name", "")).strip()
        total = float(item.get("total_price") or 0)
        if total > 0 and ocr_text and _ocr_line_has_price(name, ocr_text):
            continue  # OCR had numbers here — LLM error, don't zero
        item["total_price"] = 0
        item["quantity"] = 1
    return parsed


def fix_unit_price_consistency(parsed: dict) -> dict:
    """For qty=1 items where unit_price=0 but total_price>0, set unit=total.

    These are items where the OCR had a price but the LLM left unit_price=0.
    normalize_zero_unit_items already confirmed they should NOT be merged, so
    we just make the display consistent: unit=total for qty=1.
    """
    for item in parsed.get("items", []):
        if item.get("is_tax_line"):
            continue
        unit = float(item.get("unit_price") or 0)
        total = float(item.get("total_price") or 0)
        qty = float(item.get("quantity") or 1)
        if unit == 0 and total > 0 and abs(qty - 1) < 0.1:
            item["unit_price"] = total
    return parsed


def fix_quantity_from_totals(parsed: dict) -> dict:
    """Re-derive quantity when LLM-output qty × unit_price disagrees with total_price.

    The LLM frequently outputs qty=1 even when total_price = N × unit_price (N > 1).
    After rupee-misread correction the prices are clean, so we can trust the arithmetic:
    if total / unit is a whole number 1–10, use it as the quantity.
    """
    for item in parsed.get("items", []):
        unit = float(item.get("unit_price") or 0)
        total = float(item.get("total_price") or 0)
        if unit <= 0 or total <= 0:
            continue
        current_qty = float(item.get("quantity") or 1)
        if abs(current_qty * unit - total) < 0.5:
            continue  # already consistent
        inferred = total / unit
        if 1 <= inferred <= 10 and abs(inferred - round(inferred)) < 0.05:
            item["quantity"] = round(inferred)
    return parsed


def deduplicate_items(parsed: dict) -> dict:
    """Remove items that are name-subsets of a longer item with the same total price.

    Handles the case where the LLM emits both a merged name (e.g. 'MINI CHICKEN THALI'
    at $2235) AND the first fragment alone ('MINI CHICKEN' at $2235). The shorter name
    is the duplicate — keep the longer one.
    """
    items = parsed.get("items", [])
    if len(items) <= 1:
        return parsed

    to_remove: set[int] = set()
    for i, a in enumerate(items):
        if i in to_remove:
            continue
        name_a = str(a.get("name", "")).strip().lower()
        price_a = float(a.get("total_price") or 0)
        if price_a == 0:
            continue
        for j, b in enumerate(items):
            if j <= i or j in to_remove:
                continue
            name_b = str(b.get("name", "")).strip().lower()
            price_b = float(b.get("total_price") or 0)
            if price_a != price_b:
                continue
            # If one name strictly contains the other, the shorter one is the duplicate
            if name_a in name_b and name_a != name_b:
                to_remove.add(i)
            elif name_b in name_a and name_a != name_b:
                to_remove.add(j)

    parsed["items"] = [item for idx, item in enumerate(items) if idx not in to_remove]
    return parsed


def check_openai_health() -> dict:
    if not OPENAI_API_KEY:
        return {"status": "unreachable", "error": "OPENAI_API_KEY is not set", "models": []}
    return {"status": "ok", "models": [OPENAI_MODEL]}
