from flask import Blueprint, jsonify, request, g
from app.database import get_db
from app.middleware.auth import require_auth

assignments_bp = Blueprint("assignments", __name__)


def _owned_item(db, item_id: int, user_id: int):
    return db.execute(
        """SELECT bi.* FROM bill_items bi
           JOIN bills b ON b.id = bi.bill_id
           WHERE bi.id = ? AND b.user_id = ?""",
        (item_id, user_id)
    ).fetchone()


@assignments_bp.route("/bills/<int:bill_id>/assignments", methods=["GET"])
@require_auth
def list_assignments(bill_id):
    with get_db() as db:
        if not db.execute("SELECT id FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)).fetchone():
            return jsonify({"error": "Bill not found"}), 404
        rows = db.execute(
            """SELECT ia.* FROM item_assignments ia
               JOIN bill_items bi ON bi.id = ia.item_id
               WHERE bi.bill_id = ?
               ORDER BY ia.item_id, ia.person_id""",
            (bill_id,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@assignments_bp.route("/items/<int:item_id>/assignments", methods=["PUT"])
@require_auth
def replace_assignments(item_id):
    with get_db() as db:
        item = _owned_item(db, item_id, g.user_id)
        if not item:
            return jsonify({"error": "Item not found"}), 404
        if item["is_tax_line"]:
            return jsonify({"error": "Tax items are always split equally and cannot be assigned"}), 422

        data = request.get_json(silent=True) or {}
        assignments = data.get("assignments", [])

        if not isinstance(assignments, list):
            return jsonify({"error": "assignments must be a list"}), 422

        valid_types = {"equal", "percentage", "custom"}
        for a in assignments:
            if "person_id" not in a:
                return jsonify({"error": "Each assignment must have a person_id"}), 422
            if a.get("split_type", "equal") not in valid_types:
                return jsonify({"error": f"split_type must be one of {valid_types}"}), 422

        db.execute("DELETE FROM item_assignments WHERE item_id = ?", (item_id,))
        for a in assignments:
            split_type = a.get("split_type", "equal")
            split_value = None if split_type == "equal" else a.get("split_value")
            db.execute(
                "INSERT INTO item_assignments (item_id, person_id, split_type, split_value) VALUES (?, ?, ?, ?)",
                (item_id, a["person_id"], split_type, split_value)
            )

        rows = db.execute("SELECT * FROM item_assignments WHERE item_id = ?", (item_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


@assignments_bp.route("/items/<int:item_id>/assignments", methods=["DELETE"])
@require_auth
def clear_assignments(item_id):
    with get_db() as db:
        if not _owned_item(db, item_id, g.user_id):
            return jsonify({"error": "Item not found"}), 404
        db.execute("DELETE FROM item_assignments WHERE item_id = ?", (item_id,))
    return "", 204


def _bill_assignments(db, bill_id: int) -> list:
    return db.execute(
        """SELECT ia.* FROM item_assignments ia
           JOIN bill_items bi ON bi.id = ia.item_id
           WHERE bi.bill_id = ?
           ORDER BY ia.item_id, ia.person_id""",
        (bill_id,)
    ).fetchall()


@assignments_bp.route("/bills/<int:bill_id>/assignments/person/<int:person_id>", methods=["PUT"])
@require_auth
def bulk_assign_person(bill_id, person_id):
    """Add person to every non-tax item in the bill they are not already on (equal split)."""
    with get_db() as db:
        if not db.execute("SELECT id FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)).fetchone():
            return jsonify({"error": "Bill not found"}), 404
        if not db.execute("SELECT id FROM persons WHERE id = ? AND bill_id = ?", (person_id, bill_id)).fetchone():
            return jsonify({"error": "Person not found"}), 404

        items = db.execute(
            "SELECT id FROM bill_items WHERE bill_id = ? AND is_tax_line = 0", (bill_id,)
        ).fetchall()
        for item in items:
            already = db.execute(
                "SELECT 1 FROM item_assignments WHERE item_id = ? AND person_id = ?",
                (item["id"], person_id)
            ).fetchone()
            if not already:
                db.execute(
                    "INSERT INTO item_assignments (item_id, person_id, split_type, split_value) VALUES (?, ?, 'equal', NULL)",
                    (item["id"], person_id)
                )

        rows = _bill_assignments(db, bill_id)
    return jsonify([dict(r) for r in rows])


@assignments_bp.route("/bills/<int:bill_id>/assignments/person/<int:person_id>", methods=["DELETE"])
@require_auth
def bulk_remove_person(bill_id, person_id):
    """Remove person from every non-tax item in the bill."""
    with get_db() as db:
        if not db.execute("SELECT id FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)).fetchone():
            return jsonify({"error": "Bill not found"}), 404
        db.execute(
            """DELETE FROM item_assignments WHERE person_id = ?
               AND item_id IN (SELECT id FROM bill_items WHERE bill_id = ? AND is_tax_line = 0)""",
            (person_id, bill_id)
        )
        rows = _bill_assignments(db, bill_id)
    return jsonify([dict(r) for r in rows])
