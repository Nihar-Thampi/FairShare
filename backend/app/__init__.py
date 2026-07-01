import os
import jwt
import traceback
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from app.config import UPLOAD_FOLDER, MAX_CONTENT_LENGTH
from app.database import init_db

# Endpoints reachable without an access token.
# Every other endpoint is blocked at the global guard, regardless of
# whether the route handler has @require_auth on it or not.
_PUBLIC_ENDPOINTS = frozenset({
    "auth.register",
    "auth.login",
    "auth.refresh",
    "health.health",
    "health.llm_health",
})


def create_app():
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    CORS(app, resources={r"/api/*": {"origins": "*", "allow_headers": ["Content-Type", "Authorization"]}})

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    init_db()

    from app.routes.auth import auth_bp
    from app.routes.bills import bills_bp
    from app.routes.persons import persons_bp
    from app.routes.assignments import assignments_bp
    from app.routes.calculate import calculate_bp
    from app.routes.ocr import ocr_bp
    from app.routes.health import health_bp

    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(bills_bp, url_prefix="/api")
    app.register_blueprint(persons_bp, url_prefix="/api")
    app.register_blueprint(assignments_bp, url_prefix="/api")
    app.register_blueprint(calculate_bp, url_prefix="/api")
    app.register_blueprint(ocr_bp, url_prefix="/api")
    app.register_blueprint(health_bp, url_prefix="/api")

    @app.before_request
    def global_auth_guard():
        """Block every non-public endpoint that lacks a valid JWT access token.

        This runs before any route handler and is independent of the per-route
        @require_auth decorators. Both layers must pass before a request can
        touch the database. CORS pre-flight OPTIONS requests are always allowed
        through so the browser negotiation is not broken.
        """
        if request.method == "OPTIONS":
            return  # CORS pre-flight — never carries a token

        if request.endpoint in _PUBLIC_ENDPOINTS or request.endpoint is None:
            return

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401

        from app.services.auth_service import decode_token
        try:
            payload = decode_token(auth_header[7:].strip())
            if payload.get("type") != "access":
                return jsonify({"error": "Invalid token type"}), 401
            g.user_id = payload["sub"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

    @app.errorhandler(Exception)
    def handle_unexpected_error(e):
        app.logger.error("Unhandled exception:\n%s", traceback.format_exc())
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500

    return app
