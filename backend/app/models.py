import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from .database import Base


def _id():
    return str(uuid.uuid4())


class Institution(Base):
    __tablename__ = "institutions"
    id = Column(String(36), primary_key=True, default=_id)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=_id)
    email = Column(String(200), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(200), nullable=False)
    role = Column(String(20), nullable=False, default="student")  # student|teacher|admin|super_admin
    institution_id = Column(String(36), ForeignKey("institutions.id"), nullable=True)
    student_ref = Column(String(50), nullable=True, index=True)  # USN / roll number
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


class Classroom(Base):
    __tablename__ = "classrooms"
    id = Column(String(36), primary_key=True, default=_id)
    name = Column(String(200), nullable=False)
    subject = Column(String(100))
    section = Column(String(50))
    academic_year = Column(String(20))
    description = Column(Text)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    institution_id = Column(String(36), ForeignKey("institutions.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    teacher = relationship("User", foreign_keys=[teacher_id])
    members = relationship("ClassroomMember", back_populates="classroom", cascade="all, delete-orphan")


class ClassroomMember(Base):
    __tablename__ = "classroom_members"
    id = Column(String(36), primary_key=True, default=_id)
    classroom_id = Column(String(36), ForeignKey("classrooms.id"), nullable=False)
    student_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    classroom = relationship("Classroom", back_populates="members")
    student = relationship("User", foreign_keys=[student_id])


class Question(Base):
    __tablename__ = "questions"
    id = Column(String(36), primary_key=True, default=_id)
    bank_id = Column(String(36), nullable=True)  # bank grouping
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    subject = Column(String(100))
    topic = Column(String(100))
    difficulty = Column(String(20), default="medium")  # easy|medium|hard
    blooms_level = Column(String(30), default="understand")  # remember|understand|apply|analyze|evaluate
    lifecycle_status = Column(String(20), default="published")  # draft|in_review|approved|published|archived|retired
    version = Column(Integer, default=1)
    parent_id = Column(String(36), nullable=True)
    text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # [{"text": "...", "is_correct": true}, ...]
    explanation = Column(Text)
    marks = Column(Float, default=1.0)
    negative_marks = Column(Float, default=0.0)
    misconceptions = Column(JSON, default=dict)  # {option_index: "misconception label"}
    tags = Column(JSON, default=list)
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Exam(Base):
    __tablename__ = "exams"
    id = Column(String(36), primary_key=True, default=_id)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    subject = Column(String(100))
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    classroom_id = Column(String(36), ForeignKey("classrooms.id"), nullable=True)
    enrollment_type = Column(String(20), default="open")  # open|classroom|invite
    duration_minutes = Column(Integer, default=30)
    total_marks = Column(Float, default=0.0)
    question_count = Column(Integer, default=0)
    question_ids = Column(JSON, default=list)  # fixed pool selected by teacher
    blueprint = Column(JSON, default=dict)  # topic coverage, difficulty targets, blooms targets
    randomize_questions = Column(Boolean, default=True)
    randomize_options = Column(Boolean, default=True)
    security_mode = Column(String(20), default="practice")  # practice|classroom|secure
    negative_marking = Column(Boolean, default=False)
    require_approval = Column(Boolean, default=False)
    is_paused = Column(Boolean, default=False)
    paused_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="draft")  # draft|active|completed
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ExamSession(Base):
    """Temporary QR-based join session."""
    __tablename__ = "exam_sessions"
    id = Column(String(36), primary_key=True, default=_id)
    exam_id = Column(String(36), ForeignKey("exams.id"), nullable=False)
    access_token = Column(String(64), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"
    id = Column(String(36), primary_key=True, default=_id)
    exam_id = Column(String(36), ForeignKey("exams.id"), nullable=False)
    student_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    session_id = Column(String(36), ForeignKey("exam_sessions.id"), nullable=True)
    question_order = Column(JSON, default=list)  # [qid, qid, ...]
    option_orders = Column(JSON, default=dict)  # {qid: [orig_idx, ...]}
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    score = Column(Float, nullable=True)
    total_marks = Column(Float, nullable=True)
    status = Column(String(20), default="in_progress")  # in_progress|submitted|locked
    integrity_score = Column(Integer, default=0)
    approval_status = Column(String(20), default="approved")  # pending|approved|rejected


class AttemptQuestionSnapshot(Base):
    """Immutable snapshot of question state at time of student attempt generation."""
    __tablename__ = "attempt_question_snapshots"
    id = Column(String(36), primary_key=True, default=_id)
    attempt_id = Column(String(36), ForeignKey("exam_attempts.id"), nullable=False, index=True)
    question_id = Column(String(36), nullable=False, index=True)
    version = Column(Integer, default=1)
    text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    explanation = Column(Text, nullable=True)
    marks = Column(Float, default=1.0)
    negative_marks = Column(Float, default=0.0)
    topic = Column(String(100), nullable=True)
    blooms_level = Column(String(30), default="understand")
    is_cancelled = Column(Boolean, default=False)  # If cancelled, all students get full marks
    created_at = Column(DateTime, default=datetime.utcnow)


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"
    id = Column(String(36), primary_key=True, default=_id)
    attempt_id = Column(String(36), ForeignKey("exam_attempts.id"), nullable=False)
    question_id = Column(String(36), nullable=False)
    selected_original_index = Column(Integer, nullable=True)  # index into Question.options
    confidence_level = Column(String(20), default="certain")  # certain|unsure|guessing
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IntegrityEvent(Base):
    __tablename__ = "integrity_events"
    id = Column(String(36), primary_key=True, default=_id)
    attempt_id = Column(String(36), ForeignKey("exam_attempts.id"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ScoreAdjustment(Base):
    """Audit log of manual score adjustments and regrades."""
    __tablename__ = "score_adjustments"
    id = Column(String(36), primary_key=True, default=_id)
    attempt_id = Column(String(36), ForeignKey("exam_attempts.id"), nullable=False, index=True)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    previous_score = Column(Float, nullable=False)
    new_score = Column(Float, nullable=False)
    adjustment_amount = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)  # Mandatory justification
    created_at = Column(DateTime, default=datetime.utcnow)


class ExamTemplate(Base):
    """Reusable template for recurring exams."""
    __tablename__ = "exam_templates"
    id = Column(String(36), primary_key=True, default=_id)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    subject = Column(String(100), nullable=True)
    duration_minutes = Column(Integer, default=30)
    security_mode = Column(String(20), default="classroom")
    negative_marking = Column(Boolean, default=False)
    blueprint = Column(JSON, default=dict)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class StudentAccommodation(Base):
    """Per-student learning & accessibility accommodations."""
    __tablename__ = "student_accommodations"
    id = Column(String(36), primary_key=True, default=_id)
    student_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    extra_time_multiplier = Column(Float, default=1.0)  # e.g., 1.5 for 50% extra time
    extra_time_minutes = Column(Integer, default=0)
    high_contrast = Column(Boolean, default=False)
    large_text = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PrivacyConsent(Base):
    """Records student consent and awareness of integrity monitoring."""
    __tablename__ = "privacy_consents"
    id = Column(String(36), primary_key=True, default=_id)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    exam_id = Column(String(36), nullable=True)
    consent_version = Column(String(20), default="1.0")
    acknowledged_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String(36), primary_key=True, default=_id)
    actor_id = Column(String(36), nullable=True)
    action = Column(String(100), nullable=False)
    resource = Column(String(200))
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

