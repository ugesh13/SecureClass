import base64
from datetime import datetime, timedelta
import io
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
import qrcode
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..deps import get_current_user, require_roles
from ..websocket import manager

router = APIRouter(prefix="/exams", tags=["exams"])


def _exam_out(e: models.Exam) -> schemas.ExamOut:
    return schemas.ExamOut(
        id=e.id,
        title=e.title,
        description=e.description,
        subject=e.subject,
        teacher_id=e.teacher_id,
        classroom_id=e.classroom_id,
        duration_minutes=e.duration_minutes,
        total_marks=e.total_marks or 0.0,
        question_count=e.question_count or 0,
        question_ids=list(e.question_ids or []),
        security_mode=e.security_mode,
        status=e.status or "draft",
        is_paused=bool(e.is_paused),
        blueprint=e.blueprint or {},
        randomize_questions=bool(e.randomize_questions),
        randomize_options=bool(e.randomize_options),
        negative_marking=bool(e.negative_marking),
        require_approval=bool(e.require_approval),
        created_at=e.created_at,
    )


@router.post("", response_model=schemas.ExamOut)
def create_exam(
    payload: schemas.ExamIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    target_status = payload.status or "draft"
    if target_status == "active" and not payload.question_ids:
        raise HTTPException(400, "At least one question required to publish an active exam")

    qs = []
    if payload.question_ids:
        qs = (
            db.query(models.Question)
            .filter(models.Question.id.in_(payload.question_ids))
            .all()
        )
        if len(qs) != len(payload.question_ids):
            raise HTTPException(400, "Some questions not found in Question Bank")

    total = sum(q.marks for q in qs) if qs else 0.0
    exam = models.Exam(
        title=payload.title,
        description=payload.description,
        subject=payload.subject,
        teacher_id=user.id,
        classroom_id=payload.classroom_id if payload.classroom_id else None,
        duration_minutes=payload.duration_minutes,
        question_ids=[q.id for q in qs],
        question_count=len(qs),
        total_marks=total,
        blueprint=payload.blueprint or {},
        randomize_questions=payload.randomize_questions,
        randomize_options=payload.randomize_options,
        security_mode=payload.security_mode,
        negative_marking=payload.negative_marking,
        require_approval=payload.require_approval,
        status=target_status,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    db.add(models.AuditLog(actor_id=user.id, action=f"exam.created.{target_status}", resource=exam.id))
    db.commit()
    return _exam_out(exam)


@router.get("", response_model=list[schemas.ExamOut])
def list_exams(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    q = db.query(models.Exam)
    if user.role == "teacher":
        q = q.filter(models.Exam.teacher_id == user.id)
    return [_exam_out(e) for e in q.order_by(models.Exam.created_at.desc()).all()]


@router.get("/student/assigned")
def list_student_assigned_exams(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Returns active exams available for the student to take (open enrollment or assigned to their classroom)."""
    if user.role != "student":
        # Allow teachers/admins to also view active exams without crashing the student dashboard
        exams = db.query(models.Exam).filter(models.Exam.status == "active").order_by(models.Exam.created_at.desc()).all()
    else:
        c_ids = [
            cm.classroom_id
            for cm in db.query(models.ClassroomMember).filter_by(student_id=user.id).all()
        ]
        if c_ids:
            q = db.query(models.Exam).filter(
                models.Exam.status == "active",
                (models.Exam.classroom_id.is_(None) | models.Exam.classroom_id.in_(c_ids)),
            )
        else:
            q = db.query(models.Exam).filter(
                models.Exam.status == "active",
                models.Exam.classroom_id.is_(None),
            )
        exams = q.order_by(models.Exam.created_at.desc()).all()

    res = []
    for e in exams:
        att = db.query(models.ExamAttempt).filter_by(exam_id=e.id, student_id=user.id).first()
        active_sess = db.query(models.ExamSession).filter_by(exam_id=e.id, is_active=True).first()
        res.append({
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "subject": e.subject,
            "duration_minutes": e.duration_minutes,
            "total_marks": e.total_marks,
            "question_count": e.question_count,
            "security_mode": e.security_mode,
            "attempt_status": att.status if att else None,
            "attempt_id": att.id if att else None,
            "score": att.score if att and att.status == "submitted" else None,
            "access_token": active_sess.access_token if active_sess else None,
        })
    return res


# ---------- Templates ----------
@router.post("/templates", response_model=schemas.ExamTemplateOut)
def create_template(
    payload: schemas.ExamTemplateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    tpl = models.ExamTemplate(**payload.model_dump(), teacher_id=user.id)
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.get("/templates", response_model=list[schemas.ExamTemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    return (
        db.query(models.ExamTemplate)
        .filter(models.ExamTemplate.teacher_id == user.id)
        .order_by(models.ExamTemplate.created_at.desc())
        .all()
    )


@router.post("/from-template/{template_id}", response_model=schemas.ExamOut)
def create_exam_from_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    tpl = db.query(models.ExamTemplate).filter_by(id=template_id).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    exam = models.Exam(
        title=f"{tpl.title} (From Template)",
        description=tpl.description,
        subject=tpl.subject,
        teacher_id=user.id,
        duration_minutes=tpl.duration_minutes,
        security_mode=tpl.security_mode,
        negative_marking=tpl.negative_marking,
        blueprint=tpl.blueprint or {},
        question_ids=[],
        question_count=0,
        total_marks=0.0,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return _exam_out(exam)


@router.get("/{eid}", response_model=schemas.ExamOut)
def get_exam(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Not found")
    return _exam_out(e)


@router.get("/{eid}/details")
def get_exam_details(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Returns the exam along with full question records for preview and detailed review."""
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Exam not found")
    qs = []
    if e.question_ids:
        raw_qs = db.query(models.Question).filter(models.Question.id.in_(e.question_ids)).all()
        q_map = {q.id: q for q in raw_qs}
        qs = [
            schemas.QuestionOut.model_validate(q_map[qid]).model_dump()
            for qid in e.question_ids
            if qid in q_map
        ]
    return {
        "exam": _exam_out(e).model_dump(),
        "questions": qs,
    }


@router.put("/{eid}", response_model=schemas.ExamOut)
def update_exam(
    eid: str,
    payload: schemas.ExamIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    if exam.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")

    qs = []
    if payload.question_ids:
        qs = db.query(models.Question).filter(models.Question.id.in_(payload.question_ids)).all()
        if len(qs) != len(payload.question_ids):
            raise HTTPException(400, "Some questions not found in Question Bank")

    exam.title = payload.title
    exam.description = payload.description
    exam.subject = payload.subject
    exam.classroom_id = payload.classroom_id if payload.classroom_id else None
    exam.duration_minutes = payload.duration_minutes
    exam.question_ids = [q.id for q in qs]
    exam.question_count = len(qs)
    exam.total_marks = sum(q.marks for q in qs) if qs else 0.0
    exam.blueprint = payload.blueprint or {}
    exam.randomize_questions = payload.randomize_questions
    exam.randomize_options = payload.randomize_options
    exam.security_mode = payload.security_mode
    exam.negative_marking = payload.negative_marking
    exam.require_approval = payload.require_approval
    if payload.status:
        exam.status = payload.status

    db.commit()
    db.refresh(exam)
    db.add(models.AuditLog(actor_id=user.id, action="exam.updated", resource=exam.id))
    db.commit()
    return _exam_out(exam)


@router.delete("/{eid}")
def delete_exam(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    if exam.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    active_attempts = db.query(models.ExamAttempt).filter_by(exam_id=eid).count()
    if active_attempts > 0:
        raise HTTPException(400, "Cannot delete exam: Student attempts exist for this exam.")
    db.query(models.ExamSession).filter_by(exam_id=eid).delete()
    db.delete(exam)
    db.commit()
    return {"ok": True}


@router.post("/{eid}/duplicate", response_model=schemas.ExamOut)
def duplicate_exam(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Duplicates an existing exam into a new draft with cloned settings and questions."""
    original = db.query(models.Exam).filter_by(id=eid).first()
    if not original:
        raise HTTPException(404, "Exam not found")
    if original.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    
    cloned = models.Exam(
        title=f"{original.title} (Copy)",
        description=original.description,
        subject=original.subject,
        teacher_id=user.id,
        classroom_id=original.classroom_id,
        duration_minutes=original.duration_minutes,
        question_ids=list(original.question_ids or []),
        question_count=original.question_count,
        total_marks=original.total_marks,
        blueprint=dict(original.blueprint or {}),
        randomize_questions=original.randomize_questions,
        randomize_options=original.randomize_options,
        security_mode=original.security_mode,
        negative_marking=original.negative_marking,
        require_approval=original.require_approval,
        status="draft",
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    db.add(models.AuditLog(actor_id=user.id, action="exam.duplicated", resource=cloned.id, metadata_json={"from_exam_id": original.id}))
    db.commit()
    return _exam_out(cloned)


# ---------- Blueprint & Coverage Validation ----------
@router.get("/{eid}/blueprint-coverage")
def get_blueprint_coverage(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Computes assessment blueprint coverage across topics, difficulty, and Bloom's taxonomy."""
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    
    qs = db.query(models.Question).filter(models.Question.id.in_(exam.question_ids or [])).all()
    q_count = len(qs)
    total_marks = sum(q.marks for q in qs)
    
    # Analyze actuals
    topic_distribution = {}
    difficulty_counts = {"easy": 0, "medium": 0, "hard": 0}
    blooms_counts = {"remember": 0, "understand": 0, "apply": 0, "analyze": 0, "evaluate": 0}
    
    for q in qs:
        t = q.topic or "Uncategorized"
        topic_distribution[t] = topic_distribution.get(t, 0) + 1
        d = (q.difficulty or "medium").lower()
        if d in difficulty_counts:
            difficulty_counts[d] += 1
        b = (q.blooms_level or "understand").lower()
        if b in blooms_counts:
            blooms_counts[b] += 1
            
    difficulty_percentages = {
        k: round((v / q_count * 100), 1) if q_count else 0
        for k, v in difficulty_counts.items()
    }
    blooms_percentages = {
        k: round((v / q_count * 100), 1) if q_count else 0
        for k, v in blooms_counts.items()
    }
    
    bp = exam.blueprint or {}
    target_topics = bp.get("topics", {})
    target_difficulty = bp.get("difficulty_percentages", {"easy": 30, "medium": 50, "hard": 20})
    target_blooms = bp.get("blooms_percentages", {"remember": 20, "understand": 30, "apply": 30, "analyze": 20})
    
    warnings = []
    # Check topic coverage
    for topic, target_cnt in target_topics.items():
        actual = topic_distribution.get(topic, 0)
        if actual < target_cnt:
            warnings.append(f"Topic '{topic}' is under target: has {actual} questions, target is {target_cnt}.")
            
    # Check difficulty deviation
    for diff, target_pct in target_difficulty.items():
        actual_pct = difficulty_percentages.get(diff, 0)
        if abs(actual_pct - target_pct) > 15:
            warnings.append(f"Difficulty '{diff}' is {actual_pct}% (target is {target_pct}%).")
            
    # Suggestions for missing questions
    all_available = db.query(models.Question).filter(models.Question.teacher_id == exam.teacher_id).all()
    suggestions = []
    for candidate in all_available:
        if candidate.id in (exam.question_ids or []):
            continue
        if candidate.topic in target_topics and topic_distribution.get(candidate.topic, 0) < target_topics[candidate.topic]:
            suggestions.append({
                "question_id": candidate.id,
                "text": candidate.text[:80] + "...",
                "topic": candidate.topic,
                "difficulty": candidate.difficulty,
                "reason": f"Fulfills missing target for topic '{candidate.topic}'"
            })
            if len(suggestions) >= 5:
                break

    coverage_score = 100 - min(100, len(warnings) * 15)
    
    return {
        "exam_id": eid,
        "question_count": q_count,
        "total_marks": total_marks,
        "coverage_score": max(0, coverage_score),
        "topic_distribution": topic_distribution,
        "difficulty_distribution": difficulty_percentages,
        "blooms_distribution": blooms_percentages,
        "targets": {
            "topics": target_topics,
            "difficulty": target_difficulty,
            "blooms": target_blooms,
        },
        "warnings": warnings,
        "replacement_suggestions": suggestions,
    }


# ---------- Live Exam Lifecycle ----------
@router.post("/{eid}/start")
def start_exam(
    eid: str,
    expires_minutes: int = 30,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Not found")
    if e.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    e.status = "active"
    e.is_paused = False
    
    # Check if active session already exists for this exam
    session = db.query(models.ExamSession).filter_by(exam_id=e.id, is_active=True).first()
    if not session:
        # Generate friendly 6-character uppercase PIN (excluding ambiguous 0/O/1/I)
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        token = "".join(secrets.choice(alphabet) for _ in range(6))
        session = models.ExamSession(
            exam_id=e.id,
            access_token=token,
            expires_at=datetime.utcnow() + timedelta(minutes=expires_minutes),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    else:
        token = session.access_token
        # Extend expiration if needed
        session.expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
        db.commit()

    join_url = f"/exam/join/{token}"
    img = qrcode.make(join_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()
    db.add(models.AuditLog(actor_id=user.id, action="exam.started", resource=eid))
    db.commit()
    return {
        "session_id": session.id,
        "access_token": token,
        "expires_at": session.expires_at,
        "join_url": join_url,
        "qr_png_base64": qr_b64,
    }


@router.post("/{eid}/stop")
def stop_exam(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Not found")
    if e.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    e.status = "completed"
    for s in db.query(models.ExamSession).filter_by(exam_id=eid, is_active=True).all():
        s.is_active = False
    db.commit()
    db.add(models.AuditLog(actor_id=user.id, action="exam.stopped", resource=eid))
    db.commit()
    return {"ok": True}


# ---------- Emergency Exam Controls ----------
@router.post("/{eid}/emergency/pause")
async def emergency_pause_exam(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Emergency whole-classroom pause."""
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Exam not found")
    if e.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    
    e.is_paused = True
    e.paused_at = datetime.utcnow()
    db.commit()
    
    # Broadcast to student screens to freeze timers and answer inputs
    await manager.broadcast_all(
        eid,
        {"event": "exam_paused", "exam_id": eid, "paused_at": e.paused_at.isoformat(), "by": user.full_name},
    )
    db.add(models.AuditLog(actor_id=user.id, action="exam.emergency_pause", resource=eid))
    db.commit()
    return {"ok": True, "is_paused": True, "paused_at": e.paused_at}


@router.post("/{eid}/emergency/resume")
async def emergency_resume_exam(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Emergency resume exam, compensating student attempts for the paused duration."""
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Exam not found")
    if e.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    
    pause_delta = timedelta(seconds=0)
    if e.paused_at:
        pause_delta = datetime.utcnow() - e.paused_at
        
    e.is_paused = False
    e.paused_at = None
    
    # Shift expires_at for all in-progress attempts
    attempts = (
        db.query(models.ExamAttempt)
        .filter_by(exam_id=eid, status="in_progress")
        .all()
    )
    for a in attempts:
        if a.expires_at:
            a.expires_at += pause_delta
            
    db.commit()
    
    # Broadcast resume to student clients
    await manager.broadcast_all(
        eid,
        {
            "event": "exam_resumed",
            "exam_id": eid,
            "compensated_seconds": int(pause_delta.total_seconds()),
            "by": user.full_name,
        },
    )
    db.add(models.AuditLog(actor_id=user.id, action="exam.emergency_resume", resource=eid, metadata_json={"compensated_seconds": int(pause_delta.total_seconds())}))
    db.commit()
    return {"ok": True, "is_paused": False, "compensated_seconds": int(pause_delta.total_seconds())}


@router.post("/{eid}/emergency/extend-time")
async def emergency_extend_time(
    eid: str,
    payload: schemas.EmergencyControlIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Extends exam time for all students or an individual student."""
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Exam not found")
    if e.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
        
    extra_mins = payload.extra_minutes or 5
    delta = timedelta(minutes=extra_mins)
    
    q = db.query(models.ExamAttempt).filter_by(exam_id=eid, status="in_progress")
    if payload.student_id:
        q = q.filter_by(student_id=payload.student_id)
        
    attempts = q.all()
    for a in attempts:
        if a.expires_at:
            a.expires_at += delta
    db.commit()
    
    # Broadcast extension event
    await manager.broadcast_all(
        eid,
        {
            "event": "time_extended",
            "exam_id": eid,
            "extra_minutes": extra_mins,
            "student_id": payload.student_id,
            "by": user.full_name,
        },
    )
    db.add(models.AuditLog(actor_id=user.id, action="exam.time_extended", resource=eid, metadata_json={"extra_minutes": extra_mins, "student_id": payload.student_id}))
    db.commit()
    return {"ok": True, "affected_attempts": len(attempts), "extra_minutes": extra_mins}


@router.post("/{eid}/emergency/announce")
async def emergency_announce(
    eid: str,
    payload: schemas.EmergencyControlIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Broadcasts a high-priority teacher alert or instruction to all active students."""
    e = db.query(models.Exam).filter_by(id=eid).first()
    if not e:
        raise HTTPException(404, "Exam not found")
    if not payload.announcement:
        raise HTTPException(400, "Announcement text required")
        
    await manager.broadcast_all(
        eid,
        {
            "event": "emergency_announcement",
            "exam_id": eid,
            "announcement": payload.announcement,
            "timestamp": datetime.utcnow().isoformat(),
            "by": user.full_name,
        },
    )
    db.add(models.AuditLog(actor_id=user.id, action="exam.announcement", resource=eid, metadata_json={"text": payload.announcement}))
    db.commit()
    return {"ok": True, "announced": payload.announcement}


@router.get("/{eid}/live-roster")
def get_live_roster(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Returns the live student status matrix for 60+ simultaneous students."""
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    if exam.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")

    classroom_name = "Open Enrollment"
    if exam.classroom_id:
        c = db.query(models.Classroom).filter_by(id=exam.classroom_id).first()
        if c:
            classroom_name = f"{c.name} ({c.section})" if c.section else c.name

    # Collect all attempts
    attempts = db.query(models.ExamAttempt).filter_by(exam_id=eid).all()
    attempt_map = {a.student_id: a for a in attempts}

    # Collect enrolled students if classroom-scoped
    student_ids = set(attempt_map.keys())
    if exam.classroom_id:
        members = db.query(models.ClassroomMember).filter_by(classroom_id=exam.classroom_id).all()
        for m in members:
            student_ids.add(m.student_id)

    students = db.query(models.User).filter(models.User.id.in_(student_ids)).all() if student_ids else []
    student_dict = {s.id: s for s in students}

    roster = []
    for sid in student_ids:
        u = student_dict.get(sid)
        if not u:
            continue
        att = attempt_map.get(sid)
        
        events = []
        total_switches = 0
        total_away_seconds = 0.0
        focus_status = "FOCUSED"
        last_target = "—"
        last_departure_at = None
        has_cheating_site = False
        has_prolonged_absence = False
        violation_tags = set()

        if att:
            evs = (
                db.query(models.IntegrityEvent)
                .filter_by(attempt_id=att.id)
                .order_by(models.IntegrityEvent.created_at.desc())
                .limit(30)
                .all()
            )
            for ev in evs:
                meta = ev.metadata_json or {}
                dur = meta.get("duration_seconds")
                tgt = meta.get("target_app_or_url", meta.get("target", "—"))
                cat = meta.get("target_category", "EXTERNAL_TAB_OR_WINDOW")
                is_cheat = meta.get("is_cheating_site", False)
                flags = list(meta.get("violation_flags", []))

                if is_cheat:
                    has_cheating_site = True
                    violation_tags.add("Known Cheating Site")
                if dur and float(dur) >= 20.0:
                    has_prolonged_absence = True
                    violation_tags.add("Prolonged Absence (>20s)")

                events.append({
                    "id": ev.id,
                    "event_type": ev.event_type,
                    "at": ev.created_at.isoformat() + "Z" if ev.created_at else None,
                    "opened_at": meta.get("opened_at") or meta.get("departure_timestamp") or (ev.created_at.isoformat() + "Z" if ev.created_at else None),
                    "closed_at": meta.get("closed_at") or meta.get("return_timestamp"),
                    "duration_seconds": dur,
                    "target": tgt,
                    "target_category": cat,
                    "severity": meta.get("severity", "LOW"),
                    "status": meta.get("focus_status"),
                    "is_cheating_site": is_cheat,
                    "violation_flags": flags,
                })
                if ev.event_type in ("TAB_OR_WINDOW_LEFT", "STUDENT_DEPARTED", "SHORTCUT_NEW_TAB", "NON_BROWSER_APP_SWITCH", "TAB_CREATED", "EXTERNAL_TAB_SWITCH"):
                    total_switches += 1
                if dur:
                    try:
                        total_away_seconds += float(dur)
                    except Exception:
                        pass

            if total_switches >= 3:
                violation_tags.add("Excessive Switches (3+)")

            if evs:
                latest = evs[0]
                latest_meta = latest.metadata_json or {}
                if latest_meta.get("focus_status") == "AWAY" or latest.event_type in (
                    "TAB_OR_WINDOW_LEFT", "STUDENT_DEPARTED", "SHORTCUT_NEW_TAB", 
                    "NON_BROWSER_APP_SWITCH", "TAB_CREATED", "EXTERNAL_TAB_SWITCH", "EXTERNAL_NAVIGATION"
                ):
                    focus_status = "AWAY"
                    last_departure_at = latest_meta.get("opened_at") or (latest.created_at.isoformat() + "Z" if latest.created_at else None)
                elif latest_meta.get("focus_status") == "FOCUSED" or latest.event_type in ("STUDENT_RETURNED", "EXAM_TAB_FOCUSED"):
                    focus_status = "FOCUSED"
                    last_departure_at = None

                last_target = latest_meta.get("target_app_or_url", latest_meta.get("target", "—"))

        # Cheating risk calculation (0-100)
        risk_score = 0
        if att:
            cheat_multiplier = 40 if has_cheating_site else 0
            risk_score = min(100, int(
                (total_switches * 10) + 
                (min(60, total_away_seconds / 5) * 5) + 
                ((att.integrity_score or 0) * 8) +
                cheat_multiplier
            ))

        threat_level = "LOW"
        if risk_score >= 60 or has_cheating_site:
            threat_level = "CRITICAL"
        elif risk_score >= 35:
            threat_level = "HIGH"
        elif risk_score >= 15:
            threat_level = "MEDIUM"

        roster.append({
            "student_id": u.id,
            "student_name": u.full_name,
            "usn": u.student_ref or f"USN-{u.id[:6].upper()}",
            "section": classroom_name,
            "attempt_id": att.id if att else None,
            "status": att.status if att else "not_started",
            "score": att.score if att and att.status == "submitted" else None,
            "focus_status": "SUBMITTED" if att and att.status == "submitted" else focus_status,
            "integrity_score": att.integrity_score if att else 0,
            "total_switches": total_switches,
            "accumulated_away_seconds": round(total_away_seconds, 1),
            "last_departure_at": last_departure_at,
            "last_target": last_target,
            "risk_score": risk_score,
            "threat_level": threat_level,
            "has_cheating_site": has_cheating_site,
            "has_prolonged_absence": has_prolonged_absence,
            "has_excessive_switches": total_switches >= 3,
            "violation_tags": sorted(list(violation_tags)),
            "recent_events": events[:15],
        })

    # Sort: currently away and high risk first, then in-progress, then submitted
    def _sort_key(r):
        away_order = 0 if r["focus_status"] == "AWAY" else 1
        return (away_order, -r["risk_score"], r["student_name"].lower())

    roster.sort(key=_sort_key)
    return roster


@router.get("/{eid}/proctor-report")
def export_proctor_report(
    eid: str,
    format: str = "json",
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Generates a complete post-exam proctoring audit report for all candidates."""
    roster_data = get_live_roster(eid=eid, db=db, user=user)
    if format == "csv":
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Student Name", "USN", "Class/Section", "Exam Status", "Final Score",
            "Focus Status", "Total Switches", "Total Away (Seconds)", "Risk Score (%)",
            "Threat Level", "Violation Tags", "Last Known Target", "Recent Violations Count"
        ])
        for r in roster_data:
            writer.writerow([
                r["student_name"],
                r["usn"],
                r["section"],
                r["status"],
                r["score"] if r["score"] is not None else "N/A",
                r["focus_status"],
                r["total_switches"],
                r["accumulated_away_seconds"],
                r["risk_score"],
                r["threat_level"],
                "; ".join(r.get("violation_tags", [])),
                r["last_target"],
                len(r.get("recent_events", [])),
            ])
        from fastapi.responses import Response
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=proctor_audit_exam_{eid[:8]}.csv"}
        )
    return {"exam_id": eid, "generated_at": datetime.utcnow().isoformat() + "Z", "students": roster_data}


@router.post("/{eid}/students/{student_id}/warn")
async def warn_student(
    eid: str,
    student_id: str,
    payload: schemas.EmergencyControlIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Sends a high-priority proctor warning modal directly to a specific student."""
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    if exam.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
        
    student = db.query(models.User).filter_by(id=student_id).first()
    msg = payload.announcement or f"Proctor Warning: Tab switching and background applications are strictly prohibited. Return to the exam immediately."

    await manager.broadcast_all(
        eid,
        {
            "event": "targeted_warning",
            "exam_id": eid,
            "student_id": student_id,
            "student_name": student.full_name if student else "Student",
            "warning": msg,
            "by": user.full_name,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    )
    return {"ok": True, "warned_student": student_id, "message": msg}


@router.post("/{eid}/students/{student_id}/pause")
async def pause_individual_student(
    eid: str,
    student_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Individually pauses/locks a specific student's exam attempt."""
    att = db.query(models.ExamAttempt).filter_by(exam_id=eid, student_id=student_id, status="in_progress").first()
    if not att:
        raise HTTPException(404, "Active in-progress attempt not found for student")
        
    att.approval_status = "pending"
    db.commit()

    await manager.broadcast_all(
        eid,
        {
            "event": "student_paused",
            "exam_id": eid,
            "attempt_id": att.id,
            "student_id": student_id,
            "by": user.full_name,
        }
    )
    return {"ok": True, "attempt_id": att.id, "status": "paused"}


@router.post("/{eid}/students/{student_id}/resume")
async def resume_individual_student(
    eid: str,
    student_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Unlocks/resumes a specific student's exam attempt."""
    att = db.query(models.ExamAttempt).filter_by(exam_id=eid, student_id=student_id).first()
    if not att:
        raise HTTPException(404, "Attempt not found for student")
        
    att.approval_status = "approved"
    db.commit()

    await manager.broadcast_all(
        eid,
        {
            "event": "student_resumed",
            "exam_id": eid,
            "attempt_id": att.id,
            "student_id": student_id,
            "by": user.full_name,
        }
    )
    return {"ok": True, "attempt_id": att.id, "status": "approved"}

