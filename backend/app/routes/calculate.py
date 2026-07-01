import json
from flask import Blueprint, jsonify, g
from app.database import get_db
from app.services.split_service import calculate_bill, SplitValidationError
from app.middleware.auth import require_auth

calculate_bp = Blueprint("calculate", __name__)


@calculate_bp.route("/bills/<int:bill_id>/calculate", methods=["POST"])
@require_auth
def run_calculate(bill_id):
    with get_db() as db:
        if not db.execute("SELECT id FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)).fetchone():
            return jsonify({"error": "Bill not found"}), 404

    try:
        results = calculate_bill(bill_id)
    except SplitValidationError as e:
        return jsonify({"error": e.message, "unassigned_items": e.items}), 422

    return jsonify({"results": results})


@calculate_bp.route("/bills/<int:bill_id>/results", methods=["GET"])
@require_auth
def get_results(bill_id):
    with get_db() as db:
        if not db.execute("SELECT id FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)).fetchone():
            return jsonify({"error": "Bill not found"}), 404

        rows = db.execute(
            """SELECT cr.*, p.name as person_name, p.color as person_color
               FROM calculation_results cr
               JOIN persons p ON p.id = cr.person_id
               WHERE cr.bill_id = ?
               ORDER BY cr.person_id""",
            (bill_id,)
        ).fetchall()

    if not rows:
        return jsonify({"results": [], "calculated_at": None})

    results = []
    for row in rows:
        r = dict(row)
        results.append({
            "person": {
                "id": r["person_id"],
                "name": r["person_name"],
                "color": r["person_color"],
                "bill_id": bill_id,
            },
            "subtotal": r["subtotal"],
            "tax_share": r["tax_share"],
            "total": r["total"],
            "breakdown": json.loads(r["breakdown"]),
            "calculated_at": r["calculated_at"],
        })

    return jsonify({
        "results": results,
        "calculated_at": rows[0]["calculated_at"] if rows else None,
    })
