import sqlite3
import os
from contextlib import contextmanager
from app.config import DATABASE_PATH

DDL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bills (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Unnamed Bill',
    image_path  TEXT,
    raw_ocr     TEXT,
    llm_output  TEXT,
    status      TEXT NOT NULL DEFAULT 'draft',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS persons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id     INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#888888',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id      INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    quantity     REAL NOT NULL DEFAULT 1.0,
    unit_price   REAL NOT NULL,
    total_price  REAL NOT NULL,
    is_tax_line  INTEGER NOT NULL DEFAULT 0,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_assignments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id        INTEGER NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE,
    person_id      INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    split_type     TEXT NOT NULL DEFAULT 'equal',
    split_value    REAL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(item_id, person_id)
);

CREATE TABLE IF NOT EXISTS calculation_results (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id       INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    person_id     INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    subtotal      REAL NOT NULL,
    tax_share     REAL NOT NULL,
    total         REAL NOT NULL,
    breakdown     TEXT NOT NULL,
    calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bill_id, person_id)
);
"""


def _migrate(conn):
    cols = {row[1] for row in conn.execute("PRAGMA table_info(bills)").fetchall()}
    if "user_id" not in cols:
        conn.execute("ALTER TABLE bills ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")


def _seed(conn):
    """Create the default admin account on a fresh database.

    Credentials: email=admin@admin.com  password=admin123
    Skipped silently if the account already exists.
    """
    if conn.execute("SELECT id FROM users WHERE email = 'admin@admin.com'").fetchone():
        return
    from app.services.auth_service import hash_password
    conn.execute(
        "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
        ("admin@admin.com", hash_password("admin123"), "Admin"),
    )


def init_db():
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.executescript(DDL)
    _migrate(conn)
    _seed(conn)
    conn.commit()
    conn.close()


@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
