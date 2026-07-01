import re
import math
import easyocr

_reader: easyocr.Reader | None = None


def _get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(['en'], gpu=False)
    return _reader


def preprocess_and_extract(image_path: str) -> str:
    results = _get_reader().readtext(image_path, detail=1, paragraph=False)
    if not results:
        return ""
    lines = _group_into_lines(results)
    lines = _strip_line_numbers(lines)
    lines = _strip_rupee_prefix(lines)
    return '\n'.join(lines)


def _strip_rupee_prefix(lines: list[str]) -> list[str]:
    """Detect and remove the ₹→'2' EasyOCR misread from price tokens.

    EasyOCR reads the ₹ symbol as the digit '2', so ₹130 becomes '2130' and
    ₹2265 becomes '22265'.  We collect every numeric token ≥ 100 across all
    lines; if ≥ 70% start with '2', this is a ₹ receipt and we strip the
    leading '2' from those tokens so the LLM sees clean prices.

    Tokens below 100 are left alone so qty values like '2' or '3' are safe.
    """
    _num = re.compile(r'^\d+(?:\.\d+)?$')

    price_tokens: list[str] = []
    for line in lines:
        for tok in line.split():
            t = tok.replace(',', '')
            if _num.match(t):
                try:
                    if float(t) >= 100:
                        price_tokens.append(t)
                except ValueError:
                    pass

    if len(price_tokens) < 3:
        return lines

    starts_with_2 = sum(1 for t in price_tokens if t.startswith('2'))
    if starts_with_2 / len(price_tokens) < 0.70:
        return lines

    def _strip(tok: str) -> str:
        t = tok.replace(',', '')
        if _num.match(t):
            try:
                if float(t) >= 100 and t.startswith('2') and len(t) > 1:
                    return t[1:]
            except ValueError:
                pass
        return tok

    return [' '.join(_strip(tok) for tok in line.split()) for line in lines]


def _strip_line_numbers(lines: list[str]) -> list[str]:
    """Remove leading item serial numbers (e.g. '12 Veg Tandoori Platter…') from each line.

    Only strips a standalone 1–3 digit number at the very start of the line so
    the LLM never mistakes it for the item quantity.
    """
    cleaned = []
    for line in lines:
        stripped = re.sub(r'^\d{1,3}\s+', '', line)
        cleaned.append(stripped)
    return cleaned



def _detect_skew_angle(results: list) -> float:
    """Estimate document rotation in radians from EasyOCR bounding-box orientations.

    Each EasyOCR box has a top edge from bbox[0] (top-left) to bbox[1] (top-right).
    The angle of that edge tells us how much the document is tilted. We take the
    median across all boxes to get a robust estimate and ignore extreme angles.

    Returns 0.0 when the tilt is negligible (< 1°) or when there isn't enough signal.
    """
    angles = []
    for bbox, _, _ in results:
        dx = bbox[1][0] - bbox[0][0]
        dy = bbox[1][1] - bbox[0][1]
        if abs(dx) > 20:  # skip near-vertical detections
            angles.append(math.atan2(dy, dx))
    if len(angles) < 5:
        return 0.0
    median = sorted(angles)[len(angles) // 2]
    # Ignore if negligible (< 1°) or implausibly extreme (> 30°)
    if abs(median) < math.radians(1.0) or abs(median) > math.radians(30.0):
        return 0.0
    return median


def _group_into_lines(results: list) -> list[str]:
    """Group EasyOCR detections into receipt lines ordered top-to-bottom, left-to-right.

    When the bill is tilted, raw Y-centers mix up rows: text from the left column of
    row N ends up at the same Y as the price in the right column of row N-1, so items
    get grouped incorrectly. We detect the skew angle and apply rotation correction to
    each detection's Y-center before grouping, keeping genuinely different rows separate.

    Corrected Y for a point (cx, cy) tilted by angle θ:
        y_corrected = -cx * sin(θ) + cy * cos(θ)
    A clockwise tilt (θ > 0) inflates the raw Y of right-side items; this formula
    subtracts that inflation, bringing them back to their true row position.
    """
    skew = _detect_skew_angle(results)
    sin_s = math.sin(skew)
    cos_s = math.cos(skew)

    def _y_center(r):
        bbox = r[0]
        cx = (bbox[0][0] + bbox[2][0]) / 2
        cy = (bbox[0][1] + bbox[2][1]) / 2
        return -cx * sin_s + cy * cos_s

    sorted_results = sorted(results, key=_y_center)

    if skew != 0.0:
        print(f"[OCR] detected skew {math.degrees(skew):.1f}° — applying correction", flush=True)

    # Use median text height to set a robust line-grouping threshold
    heights = [r[0][2][1] - r[0][0][1] for r in sorted_results]
    median_height = sorted(heights)[len(heights) // 2] if heights else 20
    y_tolerance = median_height * 0.75

    groups: list[list] = []
    current_group = [sorted_results[0]]
    current_y = _y_center(sorted_results[0])

    for item in sorted_results[1:]:
        item_y = _y_center(item)
        if abs(item_y - current_y) <= y_tolerance:
            current_group.append(item)
            # Keep current_y as running average so slight drift doesn't break grouping
            current_y = sum(_y_center(r) for r in current_group) / len(current_group)
        else:
            groups.append(current_group)
            current_group = [item]
            current_y = item_y
    groups.append(current_group)

    lines = []
    for group in groups:
        group.sort(key=lambda r: r[0][0][0])
        lines.append(' '.join(text for _, text, _ in group))
    return lines
