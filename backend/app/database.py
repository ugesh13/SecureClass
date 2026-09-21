from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
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

    insp = inspect(eng)
    existing_tables = insp.get_table_names()
    
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
            ("is_paused", "BOOLEAN DEFAULT 0"),
            ("paused_at", "DATETIME"),
            ("require_approval", "BOOLEAN DEFAULT 0"),
            ("negative_marking", "BOOLEAN DEFAULT 0"),
            ("randomize_questions", "BOOLEAN DEFAULT 1"),
            ("randomize_options", "BOOLEAN DEFAULT 1"),
            ("security_mode", "VARCHAR(20) DEFAULT 'classroom'"),
            ("total_marks", "FLOAT DEFAULT 0.0"),
            ("question_count", "INTEGER DEFAULT 0"),
            ("question_ids", "JSON DEFAULT '[]'"),
        ],
        "exam_attempts": [
            ("session_id", "VARCHAR(36)"),
            ("question_order", "JSON DEFAULT '[]'"),
            ("option_orders", "JSON DEFAULT '{}'"),
            ("started_at", "DATETIME"),
            ("submitted_at", "DATETIME"),
            ("expires_at", "DATETIME"),
            ("score", "FLOAT"),
            ("total_marks", "FLOAT"),
            ("status", "VARCHAR(20) DEFAULT 'in_progress'"),
            ("integrity_score", "INTEGER DEFAULT 0"),
            ("approval_status", "VARCHAR(20) DEFAULT 'approved'"),
        ],
        "attempt_answers": [
            ("confidence_level", "VARCHAR(20) DEFAULT 'certain'"),
            ("selected_original_index", "INTEGER"),
            ("updated_at", "DATETIME"),
        ],
        "exam_sessions": [
            ("is_active", "BOOLEAN DEFAULT 1"),
            ("created_at", "DATETIME"),
            ("expires_at", "DATETIME"),
        ],
        "student_accommodations": [
            ("extra_time_multiplier", "FLOAT DEFAULT 1.0"),
            ("extra_time_minutes", "INTEGER DEFAULT 0"),
            ("high_contrast", "BOOLEAN DEFAULT 0"),
            ("large_text", "BOOLEAN DEFAULT 0"),
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
