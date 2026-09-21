from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: str = "teacher"
    institution_name: Optional[str] = None
    student_ref: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class ClassroomIn(BaseModel):
    name: str
    subject: Optional[str] = None
    section: Optional[str] = None
    academic_year: Optional[str] = None
    description: Optional[str] = None


class ClassroomOut(BaseModel):
    id: str
    name: str
    subject: Optional[str] = None
    section: Optional[str] = None
    academic_year: Optional[str] = None
    description: Optional[str] = None
    teacher_id: str
    member_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class AddStudentsIn(BaseModel):
    students: List[Dict[str, Any]]  # [{email, full_name, student_ref}]


class QuestionIn(BaseModel):
    text: str
    options: List[Dict[str, Any]]  # [{"text": str, "is_correct": bool}]
    subject: Optional[str] = None
    topic: Optional[str] = None
    difficulty: str = "medium"  # easy|medium|hard
    blooms_level: str = "understand"  # remember|understand|apply|analyze|evaluate
    explanation: Optional[str] = None
    marks: float = 1.0
    negative_marks: float = 0.0
    misconceptions: Dict[str, Any] = {}
    tags: List[str] = []
    lifecycle_status: str = "published"  # draft|in_review|approved|published|archived|retired


class QuestionOut(QuestionIn):
    id: str
    teacher_id: str
    version: int = 1
    parent_id: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class QuestionReviewActionIn(BaseModel):
    action: str  # approve|reject|retire|archive
    review_notes: Optional[str] = None


class ExamIn(BaseModel):
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    classroom_id: Optional[str] = None
    duration_minutes: int = 30
    question_ids: List[str] = []
    blueprint: Dict[str, Any] = {}
    randomize_questions: bool = True
    randomize_options: bool = True
    security_mode: str = "classroom"
    negative_marking: bool = False
    require_approval: bool = False
    status: str = "draft"
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class ExamOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    teacher_id: str
    classroom_id: Optional[str] = None
    duration_minutes: int
    total_marks: float
    question_count: int
    question_ids: List[str] = []
    security_mode: str
    status: str
    is_paused: bool = False
    blueprint: Dict[str, Any] = {}
    randomize_questions: bool
    randomize_options: bool
    negative_marking: bool
    require_approval: bool
    created_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class ExamTemplateIn(BaseModel):
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    duration_minutes: int = 30
    security_mode: str = "classroom"
    negative_marking: bool = False
    blueprint: Dict[str, Any] = {}
    instructions: Optional[str] = None


class ExamTemplateOut(ExamTemplateIn):
    id: str
    teacher_id: str
    created_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class EmergencyControlIn(BaseModel):
    action: str  # pause|resume|extend_time|announce
    extra_minutes: Optional[int] = None
    student_id: Optional[str] = None
    announcement: Optional[str] = None


class ManualGradeIn(BaseModel):
    new_score: float
    reason: str


class ScoreAdjustmentOut(BaseModel):
    id: str
    attempt_id: str
    actor_id: str
    previous_score: float
    new_score: float
    adjustment_amount: float
    reason: str
    created_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class StudentAccommodationIn(BaseModel):
    extra_time_multiplier: float = 1.0
    extra_time_minutes: int = 0
    high_contrast: bool = False
    large_text: bool = False
    notes: Optional[str] = None


class StudentAccommodationOut(StudentAccommodationIn):
    id: str
    student_id: str
    created_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class JoinExamIn(BaseModel):
    access_token: Optional[str] = None
    exam_id: Optional[str] = None


class AnswerIn(BaseModel):
    question_id: str
    displayed_index: Optional[int] = None  # index into shuffled options
    confidence_level: Optional[str] = "certain"  # certain|unsure|guessing


class IntegrityEventIn(BaseModel):
    event_type: str
    metadata: Dict[str, Any] = {}

