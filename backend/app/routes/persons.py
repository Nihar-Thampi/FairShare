from flask import Blueprint, jsonify, request, g
from app.database import get_db
from app.middleware.auth import require_auth

persons_bp = Blueprint("persons", __name__)


@persons_bp.route("/bills/<int:bill_id>/persons", methods=["GET"])
@require_auth
def list_persons(bill_id):
    with get_db() as db:
        if not db.execute("SELECT id FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)).fetchone():
            return jsonify({"error": "Bill not found"}), 404
        persons = db.execute(
            "SELECT * FROM persons WHERE bill_id = ? ORDER BY id", (bill_id,)
        ).fetchall()
    return jsonify([dict(p) for p in persons])


@persons_bp.route("/bills/<int:bill_id>/persons", methods=["POST"])
@require_auth
def add_person(bill_id):
    with get_db() as db:
        if not db.execute("SELECT id FROM bills WHERE id = ? AND user_id = ?", (bill_id, g.user_id)).fetchone():
            return jsonify({"error": "Bill not found"}), 404

        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 422

        color = (data.get("color") or "#888888").strip()
        cur = db.execute(
            "INSERT INTO persons (bill_id, name, color) VALUES (?, ?, ?)", (bill_id, name, color)
        )
        person = db.execute("SELECT * FROM persons WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(person)), 201


@persons_bp.route("/persons/<int:person_id>", methods=["DELETE"])
@require_auth
def delete_person(person_id):
    with get_db() as db:
        person = db.execute(
            """SELECT p.id FROM persons p
               JOIN bills b ON b.id = p.bill_id
               WHERE p.id = ? AND b.user_id = ?""",
            (person_id, g.user_id)
        ).fetchone()
        if not person:
            return jsonify({"error": "Person not found"}), 404
        db.execute("DELETE FROM item_assignments WHERE person_id = ?", (person_id,))
        db.execute("DELETE FROM calculation_results WHERE person_id = ?", (person_id,))
        db.execute("DELETE FROM persons WHERE id = ?", (person_id,))
    return "", 204
