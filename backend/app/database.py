from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

def normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


database_url = normalize_db_url(settings.DATABASE_URL)
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

engine = create_engine(
    database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def run_auto_migrations(eng):
    """Automatically creates any missing tables and adds newly defined columns without breaking data."""
    try:
        from . import models
        Base.metadata.create_all(bind=eng)
    except Exception:
        pass

    try:
        insp = inspect(eng)
        existing_tables = insp.get_table_names()
        is_sqlite = eng.url.get_backend_name() == "sqlite"
        bool_false = "0" if is_sqlite else "FALSE"
        bool_true = "1" if is_sqlite else "TRUE"
        dt_type = "DATETIME" if is_sqlite else "TIMESTAMP"
        
        needed_columns = {
            "questions": [
                ("blooms_level", "VARCHAR(30) DEFAULT 'understand'"),
                ("lifecycle_status", "VARCHAR(20) DEFAULT 'published'"),
                ("version", "INTEGER DEFAULT 1"),
                ("parent_id", "VARCHAR(36)"),
                ("misconceptions", "JSON DEFAULT '{}'"),
                ("review_notes", "TEXT"),
            ],
            "exams": [
                ("enrollment_type", "VARCHAR(20) DEFAULT 'open'"),
                ("blueprint", "JSON DEFAULT '{}'"),
                ("is_paused", f"BOOLEAN DEFAULT {bool_false}"),
                ("paused_at", dt_type),
                ("require_approval", f"BOOLEAN DEFAULT {bool_false}"),
                ("negative_marking", f"BOOLEAN DEFAULT {bool_false}"),
                ("randomize_questions", f"BOOLEAN DEFAULT {bool_true}"),
                ("randomize_options", f"BOOLEAN DEFAULT {bool_true}"),
                ("security_mode", "VARCHAR(20) DEFAULT 'classroom'"),
                ("total_marks", "FLOAT DEFAULT 0.0"),
                ("question_count", "INTEGER DEFAULT 0"),
                ("question_ids", "JSON DEFAULT '[]'"),
            ],
            "exam_attempts": [
                ("session_id", "VARCHAR(36)"),
                ("question_order", "JSON DEFAULT '[]'"),
                ("option_orders", "JSON DEFAULT '{}'"),
                ("started_at", dt_type),
                ("submitted_at", dt_type),
                ("expires_at", dt_type),
                ("score", "FLOAT"),
                ("total_marks", "FLOAT"),
                ("status", "VARCHAR(20) DEFAULT 'in_progress'"),
                ("integrity_score", "INTEGER DEFAULT 0"),
                ("approval_status", "VARCHAR(20) DEFAULT 'approved'"),
            ],
            "attempt_answers": [
                ("confidence_level", "VARCHAR(20) DEFAULT 'certain'"),
                ("selected_original_index", "INTEGER"),
                ("updated_at", dt_type),
            ],
            "exam_sessions": [
                ("is_active", f"BOOLEAN DEFAULT {bool_true}"),
                ("created_at", dt_type),
                ("expires_at", dt_type),
            ],
            "student_accommodations": [
                ("extra_time_multiplier", "FLOAT DEFAULT 1.0"),
                ("extra_time_minutes", "INTEGER DEFAULT 0"),
                ("high_contrast", f"BOOLEAN DEFAULT {bool_false}"),
                ("large_text", f"BOOLEAN DEFAULT {bool_false}"),
                ("notes", "TEXT"),
            ],
        }

        with eng.connect() as conn:
            for table, cols in needed_columns.items():
                if table in existing_tables:
                    current_cols = {c["name"] for c in insp.get_columns(table)}
                    for col_name, col_type in cols:
                        if col_name not in current_cols:
                            try:
                                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))
                                conn.commit()
                            except Exception:
                                pass
    except Exception:
        pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
