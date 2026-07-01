import jwt
from functools import wraps
from flask import request, jsonify, g
from app.services.auth_service import decode_token


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401
        token = auth_header[7:].strip()
        try:
            payload = decode_token(token)
            if payload.get("type") != "access":
                return jsonify({"error": "Invalid token type"}), 401
            g.user_id = payload["sub"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated
