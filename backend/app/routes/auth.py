import re
import jwt
from flask import Blueprint, jsonify, request, g
from app.database import get_db
from app.services.auth_service import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from app.middleware.auth import require_auth

auth_bp = Blueprint("auth", __name__)
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


@auth_bp.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    if not email or not _EMAIL_RE.match(email):
        return jsonify({"error": "Valid email is required"}), 422
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 422
    if not name:
        return jsonify({"error": "Name is required"}), 422

    with get_db() as db:
        if db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
            return jsonify({"error": "Email already registered"}), 409
        pw_hash = hash_password(password)
        cur = db.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
            (email, pw_hash, name)
        )
        user = db.execute(
            "SELECT id, email, name, created_at FROM users WHERE id = ?", (cur.lastrowid,)
        ).fetchone()

    user_id = user["id"]
    return jsonify({
        "user": dict(user),
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
    }), 201


@auth_bp.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    with get_db() as db:
        user = db.execute(
            "SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?", (email,)
        ).fetchone()

    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid email or password"}), 401

    user_id = user["id"]
    return jsonify({
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "created_at": user["created_at"]},
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
    })


@auth_bp.route("/auth/refresh", methods=["POST"])
def refresh():
    data = request.get_json(silent=True) or {}
    refresh_token = (data.get("refresh_token") or "").strip()
    if not refresh_token:
        return jsonify({"error": "refresh_token is required"}), 422

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            return jsonify({"error": "Invalid token type"}), 401
        user_id = payload["sub"]
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Refresh token expired, please log in again"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401

    with get_db() as db:
        if not db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone():
            return jsonify({"error": "User not found"}), 401

    return jsonify({"access_token": create_access_token(user_id)})


@auth_bp.route("/auth/me", methods=["GET"])
@require_auth
def me():
    with get_db() as db:
        user = db.execute(
            "SELECT id, email, name, created_at FROM users WHERE id = ?", (g.user_id,)
        ).fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(dict(user))
