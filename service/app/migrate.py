"""`uv run migrate`: apply any migrations/*.sql files that haven't been applied yet."""

from pathlib import Path

import psycopg

from app.settings import get_settings

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

# Separate from the Next.js app's migrations table, so the two never clash.
CREATE_TRACKING_TABLE = """
CREATE TABLE IF NOT EXISTS service_schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""


def main() -> None:
    with psycopg.connect(get_settings().database_url) as conn:
        conn.execute(CREATE_TRACKING_TABLE)
        conn.commit()
        rows = conn.execute("SELECT name FROM service_schema_migrations").fetchall()
        applied = {row[0] for row in rows}

        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in applied:
                continue
            # The migration and its tracking row commit together, or not at all.
            with conn.transaction():
                conn.execute(path.read_text())
                conn.execute(
                    "INSERT INTO service_schema_migrations (name) VALUES (%s)", (path.name,)
                )
            print(f"applied {path.name}")

    print("migrations up to date")
