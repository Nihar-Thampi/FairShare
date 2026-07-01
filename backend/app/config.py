import os
from dotenv import load_dotenv

load_dotenv(override=True)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATABASE_PATH = os.path.join(BASE_DIR, os.getenv("DATABASE_PATH", "data/fairshare.db"))
UPLOAD_FOLDER = os.path.join(BASE_DIR, os.getenv("UPLOAD_FOLDER", "uploads"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB upload limit

JWT_SECRET = os.getenv("JWT_SECRET", "CHANGE-THIS-IN-PRODUCTION")
JWT_ACCESS_EXPIRY = int(os.getenv("JWT_ACCESS_EXPIRY", "900"))    # 15 min
JWT_REFRESH_EXPIRY = int(os.getenv("JWT_REFRESH_EXPIRY", "604800"))  # 7 days
