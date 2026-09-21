from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/questions", tags=["questions"])


def _validate_options(options):
    if not options or len(options) < 2:
        raise HTTPException(400, "At least 2 options required")
    correct = sum(1 for o in options if o.get("is_correct"))
    if correct != 1:
        raise HTTPException(400, "Exactly one correct option required")


@router.post("", response_model=schemas.QuestionOut)
def create_question(
    payload: schemas.QuestionIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    _validate_options(payload.options)
    data = payload.model_dump()
    q = models.Question(**data, teacher_id=user.id, version=1)
    db.add(q)
    db.commit()
    db.refresh(q)
    db.add(models.AuditLog(actor_id=user.id, action="question.created", resource=q.id, metadata_json={"status": q.lifecycle_status}))
    db.commit()
    return q


@router.get("")
def list_questions(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    blooms_level: Optional[str] = None,
    lifecycle_status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    q = db.query(models.Question).filter(models.Question.teacher_id == user.id)
    if search:
        s = f"%{search}%"
        q = q.filter((models.Question.text.ilike(s)) | (models.Question.subject.ilike(s)) | (models.Question.topic.ilike(s)))
    if subject:
        q = q.filter(models.Question.subject == subject)
    if topic:
        q = q.filter(models.Question.topic == topic)
    if difficulty:
        q = q.filter(models.Question.difficulty == difficulty)
    if blooms_level:
        q = q.filter(models.Question.blooms_level == blooms_level)
    if lifecycle_status:
        q = q.filter(models.Question.lifecycle_status == lifecycle_status)
    return [
        schemas.QuestionOut.model_validate(x).model_dump()
        for x in q.order_by(models.Question.created_at.desc()).all()
    ]


@router.get("/{qid}", response_model=schemas.QuestionOut)
def get_question(
    qid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    q = db.query(models.Question).filter_by(id=qid).first()
    if not q:
        raise HTTPException(404, "Question not found")
    return q


@router.put("/{qid}", response_model=schemas.QuestionOut)
def update_question(
    qid: str,
    payload: schemas.QuestionIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    q = db.query(models.Question).filter_by(id=qid).first()
    if not q:
        raise HTTPException(404, "Not found")
    if q.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    _validate_options(payload.options)
    for k, v in payload.model_dump().items():
        setattr(q, k, v)
    db.commit()
    db.refresh(q)
    return q


@router.post("/{qid}/new-version", response_model=schemas.QuestionOut)
def create_new_version(
    qid: str,
    payload: schemas.QuestionIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Creates an incremented version of an existing question while preserving history."""
    parent = db.query(models.Question).filter_by(id=qid).first()
    if not parent:
        raise HTTPException(404, "Original question not found")
    if parent.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    _validate_options(payload.options)
    
    root_id = parent.parent_id or parent.id
    new_version_num = parent.version + 1
    
    data = payload.model_dump()
    data.pop("lifecycle_status", None)
    new_q = models.Question(
        **data,
        teacher_id=user.id,
        version=new_version_num,
        parent_id=root_id,
        lifecycle_status="draft",
        review_notes=f"Branched from v{parent.version}",
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    db.add(models.AuditLog(actor_id=user.id, action="question.versioned", resource=new_q.id, metadata_json={"from_version": parent.version, "new_version": new_version_num}))
    db.commit()
    return new_q


@router.post("/{qid}/review-action", response_model=schemas.QuestionOut)
def review_question(
    qid: str,
    action_in: schemas.QuestionReviewActionIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Review workflow: transitions question between draft, in_review, approved, published, archived, retired."""
    q = db.query(models.Question).filter_by(id=qid).first()
    if not q:
        raise HTTPException(404, "Question not found")
    action = action_in.action.lower()
    valid_actions = {
        "submit_review": "in_review",
        "approve": "approved",
        "publish": "published",
        "reject": "draft",
        "archive": "archived",
        "retire": "retired",
    }
    target_status = valid_actions.get(action)
    if not target_status:
        raise HTTPException(400, f"Invalid action. Choose from: {list(valid_actions.keys())}")
    
    q.lifecycle_status = target_status
    if action_in.review_notes:
        q.review_notes = action_in.review_notes
    db.commit()
    db.refresh(q)
    db.add(models.AuditLog(actor_id=user.id, action=f"question.{action}", resource=q.id, metadata_json={"target_status": target_status}))
    db.commit()
    return q


@router.get("/{qid}/versions")
def get_question_versions(
    qid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Retrieves all versions belonging to this question hierarchy."""
    q = db.query(models.Question).filter_by(id=qid).first()
    if not q:
        raise HTTPException(404, "Question not found")
    root_id = q.parent_id or q.id
    versions = (
        db.query(models.Question)
        .filter((models.Question.id == root_id) | (models.Question.parent_id == root_id))
        .order_by(models.Question.version.asc())
        .all()
    )
    return [schemas.QuestionOut.model_validate(v).model_dump() for v in versions]


@router.get("/{qid}/usage")
def get_question_usage(
    qid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Returns exams where this question is included."""
    exams = db.query(models.Exam).filter(models.Exam.teacher_id == user.id).all()
    used_in = [
        {"id": e.id, "title": e.title, "status": e.status}
        for e in exams
        if e.question_ids and qid in e.question_ids
    ]
    return {"question_id": qid, "used_in_exams_count": len(used_in), "exams": used_in}


@router.delete("/{qid}")
def delete_question(
    qid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    q = db.query(models.Question).filter_by(id=qid).first()
    if not q:
        raise HTTPException(404, "Not found")
    if q.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    # Safeguard: check if question has been used in active exams
    exams = db.query(models.Exam).all()
    active_in = [e.title for e in exams if e.question_ids and qid in e.question_ids and e.status in ("active", "completed")]
    if active_in:
        raise HTTPException(400, f"Cannot delete: Question is used in completed or active exams ({', '.join(active_in)}). Archive or retire it instead.")
    db.delete(q)
    db.commit()
    return {"ok": True}

