from flask import Blueprint, jsonify
from app.services.llm_service import check_openai_health

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@health_bp.route("/health/llm", methods=["GET"])
def llm_health():
    result = check_openai_health()
    status_code = 200 if result["status"] == "ok" else 503
    return jsonify(result), status_code
