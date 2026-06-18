"""SQLAlchemy engine and session helpers."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

# check_same_thread=False lets the background sync thread share the SQLite file.
_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they register on the metadata before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate()
    _ensure_added_columns()


def _ensure_added_columns() -> None:
    """Add columns introduced after a table's first release — on any backend.

    create_all() never alters an existing table, so when a model gains a column
    we add it here, idempotently. ALTER TABLE ADD COLUMN works on both SQLite
    and PostgreSQL, so this covers local dev and production alike.
    """
    from sqlalchemy import inspect

    added = {
        "open_positions": [("sl", "FLOAT DEFAULT 0.0")],
    }
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, cols in added.items():
            if table not in tables:
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols:
                if name not in existing:
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"
                    )


# Columns added after the first release. SQLite supports ADD COLUMN, so we patch
# existing tables in place (a lightweight stand-in for Alembic on SQLite).
_NEW_COLUMNS = {
    "connections": [
        ("provider", "VARCHAR(32) DEFAULT 'demo'"),
        ("meta_enc", "TEXT DEFAULT ''"),
    ],
    "users": [
        ("telegram_link_code", "VARCHAR(16)"),
    ],
}


def _migrate() -> None:
    if not settings.database_url.startswith("sqlite"):
        return  # real DBs should use Alembic; nothing to patch here
    with engine.begin() as conn:
        for table, cols in _NEW_COLUMNS.items():
            existing = {
                row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")
            }
            for name, ddl in cols:
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
