import os
from dotenv import load_dotenv

# .env wins over the shell, except in Docker (DOTENV_OVERRIDE=0), where the compose file's
# settings for the container must win over a .env written for running natively.
load_dotenv(override=os.environ.get("DOTENV_OVERRIDE", "1") != "0")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATABASE_PATH = os.path.join(BASE_DIR, os.getenv("DATABASE_PATH", "data/fairshare.db"))
UPLOAD_FOLDER = os.path.join(BASE_DIR, os.getenv("UPLOAD_FOLDER", "uploads"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
DEBUG = os.getenv("FLASK_DEBUG", "").strip().lower() in ("1", "true", "yes", "on")
# Create the admin@admin.com / admin123 demo account on a fresh database. Local/demo use only.
SEED_DEMO_ADMIN = os.getenv("SEED_DEMO_ADMIN", "").strip().lower() in ("1", "true", "yes", "on")
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB upload limit

DEFAULT_JWT_SECRET = "CHANGE-THIS-IN-PRODUCTION"
JWT_SECRET = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
JWT_ACCESS_EXPIRY = int(os.getenv("JWT_ACCESS_EXPIRY", "900"))    # 15 min
JWT_REFRESH_EXPIRY = int(os.getenv("JWT_REFRESH_EXPIRY", "604800"))  # 7 days


def check_secrets():
    """Refuse to run outside debug mode with the placeholder JWT secret (tokens would be forgeable)."""
    if JWT_SECRET == DEFAULT_JWT_SECRET and not DEBUG:
        raise RuntimeError(
            "JWT_SECRET is not set. Set a long random JWT_SECRET in backend/.env, "
            "or set FLASK_DEBUG=true for local development only."
        )
