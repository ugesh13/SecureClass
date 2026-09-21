from datetime import datetime, timedelta
import json
import random
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..deps import get_current_user, require_roles
from ..websocket import manager

router = APIRouter(tags=["attempts"])


def _normalize_token(t: str) -> str:
    if not t:
        return ""
    # Strip whitespace, dashes, underscores
    s = t.strip().upper().replace("-", "").replace("_", "").replace(" ", "")
    # Normalize common lookalikes: 0 -> O, 1 -> I, L -> I
    return s.replace("0", "O").replace("1", "I").replace("L", "I")


@router.post("/exams/join")
async def join_exam(
    payload: schemas.JoinExamIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    exam = None
    session = None
    if payload.access_token:
        tok = payload.access_token.strip()
        # 1. Exact active token match
        session = (
            db.query(models.ExamSession)
            .filter_by(access_token=tok, is_active=True)
            .first()
        )
        # 2. Case-insensitive active token match
        if not session:
            all_active = db.query(models.ExamSession).filter_by(is_active=True).all()
            for s in all_active:
                if s.access_token.lower() == tok.lower():
                    session = s
                    break
        
        # 3. Normalized active token match (handles dashes, spaces, 0 vs O, 1 vs I)
        if not session:
            norm_tok = _normalize_token(tok)
            all_active = db.query(models.ExamSession).filter_by(is_active=True).all()
            for s in all_active:
                if _normalize_token(s.access_token) == norm_tok:
                    session = s
                    break
        
        # 4. Match against active exam ID or title if token matches
        if not session:
            potential_exam = (
                db.query(models.Exam)
                .filter(
                    (models.Exam.id == tok) | 
                    (models.Exam.id.ilike(f"{tok}%")) |
                    (models.Exam.title.ilike(tok))
                )
                .first()
            )
            if potential_exam:
                exam = potential_exam
                session = db.query(models.ExamSession).filter_by(exam_id=exam.id, is_active=True).first()
                if not session and exam.status == "active":
                    import secrets
                    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
                    new_pin = "".join(secrets.choice(alphabet) for _ in range(6))
                    session = models.ExamSession(
                        exam_id=exam.id,
                        access_token=new_pin,
                        expires_at=datetime.utcnow() + timedelta(minutes=exam.duration_minutes or 60),
                    )
                    db.add(session)
                    db.commit()
                    db.refresh(session)
                    
        if session:
            exp = session.expires_at
            now = datetime.utcnow()
            if isinstance(exp, str):
                try:
                    exp = datetime.fromisoformat(exp.replace("Z", ""))
                except Exception:
                    exp = None
            if exp and exp < now:
                raise HTTPException(403, "Access token expired or invalid")
            if not exam:
                exam = db.query(models.Exam).filter_by(id=session.exam_id).first()
        elif not exam:
            raise HTTPException(404, "Invalid access token or exam not found. Please check your code.")

    elif payload.exam_id:
        exam = db.query(models.Exam).filter_by(id=payload.exam_id).first()
        session = db.query(models.ExamSession).filter_by(exam_id=payload.exam_id, is_active=True).first()
        if not session and exam and exam.status == "active":
            import secrets
            alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            new_pin = "".join(secrets.choice(alphabet) for _ in range(6))
            session = models.ExamSession(
                exam_id=exam.id,
                access_token=new_pin,
                expires_at=datetime.utcnow() + timedelta(minutes=exam.duration_minutes or 60),
            )
            db.add(session)
            db.commit()
            db.refresh(session)

    if not exam:
        raise HTTPException(404, "Exam not found")
    if exam.status != "active":
        raise HTTPException(403, "Exam is not active")
        
    # Roster check if classroom-scoped (skip for teacher/admin testing)
    if exam.classroom_id and user.role == "student":
        in_class = (
            db.query(models.ClassroomMember)
            .filter_by(classroom_id=exam.classroom_id, student_id=user.id)
            .first()
        )
        if not in_class:
            raise HTTPException(403, "You are not enrolled in this classroom")
            
    # Multiple-session / duplicate check
    existing = (
        db.query(models.ExamAttempt)
        .filter_by(exam_id=exam.id, student_id=user.id)
        .first()
    )
    if existing:
        if existing.status == "in_progress" or user.role != "student":
            return {"attempt_id": existing.id, "recovered": True}
        raise HTTPException(403, "You have already attempted this exam")
        
    # Check student accessibility / accommodations
    accommodation = (
        db.query(models.StudentAccommodation)
        .filter_by(student_id=user.id)
        .first()
    )
    duration = exam.duration_minutes or 60
    if accommodation:
        mult = accommodation.extra_time_multiplier or 1.0
        extra_m = accommodation.extra_time_minutes or 0
        duration = int((duration * mult) + extra_m)
        
    # Build randomized question order
    qids = list(exam.question_ids or [])
    if isinstance(qids, str):
        try:
            qids = json.loads(qids)
        except Exception:
            qids = []
    if exam.randomize_questions:
        random.shuffle(qids)
    qs = {}
    if qids:
        qs = {
            q.id: q
            for q in db.query(models.Question).filter(models.Question.id.in_(qids)).all()
        }
    option_orders = {}
    for qid in qids:
        q = qs.get(qid)
        if not q:
            continue
        raw_opts = q.options
        if isinstance(raw_opts, str):
            try:
                raw_opts = json.loads(raw_opts)
            except Exception:
                raw_opts = []
        if not isinstance(raw_opts, list):
            raw_opts = []
        idx = list(range(len(raw_opts)))
        if exam.randomize_options:
            random.shuffle(idx)
        option_orders[qid] = idx

    attempt = models.ExamAttempt(
        exam_id=exam.id,
        student_id=user.id,
        session_id=session.id if session else None,
        question_order=qids,
        option_orders=option_orders,
        expires_at=datetime.utcnow() + timedelta(minutes=duration),
        approval_status="pending" if exam.require_approval else "approved",
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    
    # Freeze questions into immutable AttemptQuestionSnapshot
    for qid in qids:
        q = qs.get(qid)
        if not q:
            continue
        opts = q.options
        if isinstance(opts, str):
            try:
                opts = json.loads(opts)
            except Exception:
                opts = []
        snapshot = models.AttemptQuestionSnapshot(
            attempt_id=attempt.id,
            question_id=q.id,
            version=getattr(q, "version", 1) or 1,
            text=q.text,
            options=opts,
            explanation=q.explanation,
            marks=q.marks if q.marks is not None else 1.0,
            negative_marks=getattr(q, "negative_marks", 0.0) or 0.0,
            topic=q.topic,
            blooms_level=getattr(q, "blooms_level", "understand") or "understand",
        )
        db.add(snapshot)
    try:
        db.commit()
    except Exception:
        db.rollback()

    try:
        await manager.broadcast_teacher(
            exam.id,
            {
                "event": "student_joined",
                "attempt_id": attempt.id,
                "student_name": user.full_name,
                "student_id": user.id,
                "has_accommodation": bool(accommodation),
            },
        )
    except Exception:
        pass

    return {
        "attempt_id": attempt.id,
        "requires_approval": exam.require_approval,
        "duration_minutes": duration,
        "accommodation_applied": bool(accommodation),
    }


@router.get("/attempts/{aid}")
def get_attempt(
    aid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = db.query(models.ExamAttempt).filter_by(id=aid).first()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if user.role == "student" and attempt.student_id != user.id:
        raise HTTPException(403, "Forbidden")
    exam = db.query(models.Exam).filter_by(id=attempt.exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    if getattr(attempt, "approval_status", "approved") == "pending":
        return {"status": "pending_approval", "attempt_id": attempt.id}
    if getattr(attempt, "approval_status", "approved") == "rejected":
        return {"status": "rejected"}
        
    answers = {}
    confidences = {}
    for a in db.query(models.AttemptAnswer).filter_by(attempt_id=aid).all():
        answers[a.question_id] = a.selected_original_index
        confidences[a.question_id] = a.confidence_level

    # Load from immutable snapshots first, falling back to questions table
    snapshots = {}
    try:
        snapshots = {
            s.question_id: s
            for s in db.query(models.AttemptQuestionSnapshot).filter_by(attempt_id=aid).all()
        }
    except Exception:
        snapshots = {}

    question_order = attempt.question_order or []
    if isinstance(question_order, str):
        try:
            question_order = json.loads(question_order)
        except Exception:
            question_order = []

    option_orders = attempt.option_orders or {}
    if isinstance(option_orders, str):
        try:
            option_orders = json.loads(option_orders)
        except Exception:
            option_orders = {}

    qs = {}
    if (not snapshots) and question_order:
        qs = {
            q.id: q
            for q in db.query(models.Question)
            .filter(models.Question.id.in_(question_order))
            .all()
        }

    questions = []
    for qid in question_order:
        item = snapshots.get(qid) or qs.get(qid)
        if not item:
            continue

        raw_opts = item.options
        if isinstance(raw_opts, str):
            try:
                raw_opts = json.loads(raw_opts)
            except Exception:
                raw_opts = []
        if not isinstance(raw_opts, list):
            raw_opts = []

        order = option_orders.get(qid) or list(range(len(raw_opts)))
        shuffled_opts = []
        for i in order:
            if 0 <= i < len(raw_opts):
                opt = raw_opts[i]
                txt = opt.get("text", "") if isinstance(opt, dict) else str(opt)
                shuffled_opts.append({"text": txt})

        # When exam is submitted, provide full review feedback including explanations
        is_submitted = attempt.status == "submitted"
        q_data = {
            "id": item.question_id if hasattr(item, "question_id") else item.id,
            "text": item.text,
            "options": shuffled_opts,
            "marks": getattr(item, "marks", 1.0),
            "topic": getattr(item, "topic", None),
            "difficulty": getattr(item, "difficulty", "medium"),
            "blooms_level": getattr(item, "blooms_level", "understand"),
            "is_cancelled": getattr(item, "is_cancelled", False),
        }
        if is_submitted:
            correct_orig_idx = next(
                (i for i, o in enumerate(raw_opts) if isinstance(o, dict) and o.get("is_correct")), None
            )
            # Find which shuffled option was correct
            correct_shuffled_idx = next(
                (pos for pos, orig_i in enumerate(order) if orig_i == correct_orig_idx), None
            )
            q_data["explanation"] = getattr(item, "explanation", None)
            q_data["correct_displayed_index"] = correct_shuffled_idx
            q_data["correct_original_index"] = correct_orig_idx
            
        questions.append(q_data)

    # Student accommodations
    acc = None
    try:
        acc = db.query(models.StudentAccommodation).filter_by(student_id=attempt.student_id).first()
    except Exception:
        acc = None

    accommodations = {
        "high_contrast": acc.high_contrast if acc else False,
        "large_text": acc.large_text if acc else False,
    }

    remaining_secs = 0
    now = datetime.utcnow()
    if attempt.status == "in_progress":
        exp = attempt.expires_at
        if isinstance(exp, str):
            try:
                exp = datetime.fromisoformat(exp.replace("Z", ""))
            except Exception:
                exp = None
        if exp:
            remaining_secs = max(0, int((exp - now).total_seconds()))
        elif exam.duration_minutes:
            remaining_secs = exam.duration_minutes * 60
        else:
            remaining_secs = 3600

    started_iso = attempt.started_at.isoformat() + "Z" if hasattr(attempt.started_at, "isoformat") else str(attempt.started_at or "")
    expires_iso = attempt.expires_at.isoformat() + "Z" if hasattr(attempt.expires_at, "isoformat") else str(attempt.expires_at or "")

    return {
        "status": attempt.status,
        "attempt_id": attempt.id,
        "exam": {
            "id": exam.id,
            "title": exam.title,
            "duration_minutes": exam.duration_minutes,
            "security_mode": exam.security_mode,
            "total_marks": exam.total_marks,
            "is_paused": bool(getattr(exam, "is_paused", False)),
        },
        "questions": questions,
        "answers": answers,
        "confidences": confidences,
        "started_at": started_iso if started_iso else None,
        "expires_at": expires_iso if expires_iso else None,
        "remaining_seconds": remaining_secs,
        "server_now": now.isoformat() + "Z",
        "score": attempt.score if attempt.status == "submitted" else None,
        "is_paused": bool(getattr(exam, "is_paused", False)),
        "accommodations": accommodations,
    }


@router.post("/attempts/{aid}/answers")
def save_answer(
    aid: str,
    payload: schemas.AnswerIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = db.query(models.ExamAttempt).filter_by(id=aid).first()
    if not attempt:
        raise HTTPException(404, "Not found")
    if attempt.student_id != user.id:
        raise HTTPException(403, "Forbidden")
    if attempt.status != "in_progress":
        raise HTTPException(400, "Attempt not in progress")
    exam = db.query(models.Exam).filter_by(id=attempt.exam_id).first()
    if exam and exam.is_paused:
        raise HTTPException(400, "Exam is currently paused by the proctor")
    if attempt.expires_at and datetime.utcnow() > attempt.expires_at:
        raise HTTPException(400, "Time expired")

    order = attempt.option_orders.get(payload.question_id)
    if order is None or payload.question_id not in attempt.question_order:
        raise HTTPException(400, "Question not in this attempt")

    original_idx = None
    if payload.displayed_index is not None:
        if payload.displayed_index < 0 or payload.displayed_index >= len(order):
            raise HTTPException(400, "Invalid option index")
        original_idx = order[payload.displayed_index]

    ans = (
        db.query(models.AttemptAnswer)
        .filter_by(attempt_id=aid, question_id=payload.question_id)
        .first()
    )
    if ans:
        ans.selected_original_index = original_idx
        if payload.confidence_level:
            ans.confidence_level = payload.confidence_level
    else:
        db.add(
            models.AttemptAnswer(
                attempt_id=aid,
                question_id=payload.question_id,
                selected_original_index=original_idx,
                confidence_level=payload.confidence_level or "certain",
            )
        )
    db.commit()
    return {"ok": True, "saved_at": datetime.utcnow()}


@router.post("/attempts/{aid}/submit")
async def submit_attempt(
    aid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = db.query(models.ExamAttempt).filter_by(id=aid).first()
    if not attempt:
        raise HTTPException(404, "Not found")
    if attempt.student_id != user.id and user.role not in (
        "teacher",
        "admin",
        "super_admin",
    ):
        raise HTTPException(403, "Forbidden")
    if attempt.status == "submitted":
        return {"ok": True, "score": attempt.score, "already": True}

    exam = db.query(models.Exam).filter_by(id=attempt.exam_id).first()
    
    # Evaluate against immutable snapshots first, falling back to Question records
    snapshots = {
        s.question_id: s
        for s in db.query(models.AttemptQuestionSnapshot).filter_by(attempt_id=aid).all()
    }
    fallback_qs = {}
    if not snapshots and attempt.question_order:
        fallback_qs = {
            q.id: q
            for q in db.query(models.Question)
            .filter(models.Question.id.in_(attempt.question_order))
            .all()
        }

    answers = {
        a.question_id: a.selected_original_index
        for a in db.query(models.AttemptAnswer).filter_by(attempt_id=aid).all()
    }

    score = 0.0
    total = 0.0
    for qid in attempt.question_order:
        q = snapshots.get(qid) or fallback_qs.get(qid)
        if not q:
            continue
        total += q.marks
        
        # If question was cancelled by teacher/grace marks, grant full marks
        if getattr(q, "is_cancelled", False):
            score += q.marks
            continue
            
        sel = answers.get(qid)
        if sel is None:
            continue
        correct_idx = next(
            (i for i, o in enumerate(q.options) if o.get("is_correct")), None
        )
        if sel == correct_idx:
            score += q.marks
        elif exam.negative_marking:
            score -= q.negative_marks

    attempt.status = "submitted"
    attempt.submitted_at = datetime.utcnow()
    attempt.score = round(score, 2)
    attempt.total_marks = total
    db.commit()

    await manager.broadcast_teacher(
        exam.id,
        {
            "event": "exam_submitted",
            "attempt_id": attempt.id,
            "student_id": attempt.student_id,
            "score": attempt.score,
        },
    )
    return {"ok": True, "score": attempt.score, "total_marks": total}


@router.post("/attempts/{aid}/events")
async def record_event(
    aid: str,
    payload: schemas.IntegrityEventIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = db.query(models.ExamAttempt).filter_by(id=aid).first()
    if not attempt:
        raise HTTPException(404, "Not found")
    if attempt.student_id != user.id:
        raise HTTPException(403, "Forbidden")
        
    exam = db.query(models.Exam).filter_by(id=attempt.exam_id).first()
    classroom_name = "Open Session"
    if exam and exam.classroom_id:
        c = db.query(models.Classroom).filter_by(id=exam.classroom_id).first()
        if c:
            classroom_name = f"{c.name} ({c.section})" if c.section else c.name

    weights = {
        "TAB_OR_WINDOW_LEFT": 1,
        "STUDENT_DEPARTED": 1,
        "STUDENT_RETURNED": 0,
        "FULLSCREEN_EXIT": 2,
        "COPY_ATTEMPT": 1,
        "PASTE_ATTEMPT": 1,
        "CONTEXT_MENU_ATTEMPT": 1,
        "PAGE_RELOAD": 1,
        "MULTIPLE_SESSION_ATTEMPT": 3,
        "SUSPICIOUS_KEYSTROKE": 1,
        "SCREEN_PROCTOR_DISCONNECTED": 3,
        "SHORTCUT_NEW_TAB": 2,
        "TAB_CREATED": 2,
        "TAB_CLOSED": 0,
        "NON_BROWSER_APP_SWITCH": 3,
        "EXTERNAL_NAVIGATION": 3,
        "EXTERNAL_TAB_SWITCH": 2,
        "DEVTOOLS_ATTEMPT": 4,
    }
    w = weights.get(payload.event_type, 1)

    # Heuristic threat analysis & domain categorization
    meta = dict(payload.metadata or {})
    duration = float(meta.get("duration_seconds", 0.0) or 0.0)
    target = str(meta.get("target_app_or_url", meta.get("target", "External Window / Tab"))).strip()
    target_lower = target.lower()

    # Domain & App Classification Matrices
    ai_assistants = [
        "chatgpt.com", "chat.openai.com", "claude.ai", "perplexity.ai", 
        "gemini.google.com", "copilot.microsoft.com", "poe.com", "deepseek.com", 
        "groq.com", "mistral.ai", "you.com"
    ]
    solvers = [
        "chegg.com", "brainly.com", "coursehero.com", "quizlet.com", 
        "studocu.com", "slader.com", "symbolab.com", "mathway.com", 
        "photomath.com", "wolframalpha.com", "numerade.com"
    ]
    coding_forums = [
        "stackoverflow.com", "stackexchange.com", "github.com", 
        "leetcode.com", "geeksforgeeks.org", "hackerrank.com", "w3schools.com"
    ]
    messaging_apps = [
        "discord", "telegram", "whatsapp", "slack", "teams", 
        "skype", "zoom", "signal", "messenger.com"
    ]
    prohibited_apps = [
        "code.exe", "visual studio code", "terminal", "powershell", 
        "cmd.exe", "calculator", "pycharm", "cursor.exe", "sublime_text", "notepad++.exe"
    ]

    target_category = "EXTERNAL_TAB_OR_WINDOW"
    is_known_cheating_site = False
    violation_flags = []

    if any(site in target_lower for site in ai_assistants):
        target_category = "AI_ASSISTANT"
        is_known_cheating_site = True
        violation_flags.append("AI_ASSISTANT_ACCESSED")
    elif any(site in target_lower for site in solvers):
        target_category = "HOMEWORK_SOLVER"
        is_known_cheating_site = True
        violation_flags.append("HOMEWORK_SOLVER_ACCESSED")
    elif any(site in target_lower for site in coding_forums):
        target_category = "CODE_OR_FORUM"
        violation_flags.append("CODE_FORUM_ACCESSED")
    elif any(app in target_lower for app in messaging_apps):
        target_category = "MESSAGING_APP"
        is_known_cheating_site = True
        violation_flags.append("MESSAGING_APP_OPENED")
    elif any(app in target_lower for app in prohibited_apps):
        target_category = "PROHIBITED_DESKTOP_APP"
        violation_flags.append("PROHIBITED_APP_ACCESSED")

    if duration >= 20.0:
        violation_flags.append("PROLONGED_ABSENCE")

    severity = meta.get("severity")
    if not severity:
        if is_known_cheating_site or "MESSAGING_APP" in target_category:
            severity = "CRITICAL"
        elif duration >= 20.0 or w >= 3:
            severity = "HIGH"
        elif duration >= 5.0 or w >= 2:
            severity = "MEDIUM"
        else:
            severity = "LOW"

    focus_status = meta.get("status")
    if not focus_status:
        if payload.event_type in ("STUDENT_RETURNED", "EXAM_TAB_FOCUSED"):
            focus_status = "FOCUSED"
        elif payload.event_type in (
            "TAB_OR_WINDOW_LEFT", "STUDENT_DEPARTED", "SHORTCUT_NEW_TAB", 
            "NON_BROWSER_APP_SWITCH", "TAB_CREATED", "EXTERNAL_TAB_SWITCH", "EXTERNAL_NAVIGATION"
        ):
            focus_status = "AWAY"
        else:
            focus_status = "FOCUSED"

    now_iso = datetime.utcnow().isoformat() + "Z"
    opened_at = meta.get("departure_timestamp") or meta.get("opened_at") or (now_iso if focus_status == "AWAY" else None)
    closed_at = meta.get("return_timestamp") or meta.get("closed_at") or (now_iso if focus_status == "FOCUSED" else None)

    meta["severity"] = severity
    meta["focus_status"] = focus_status
    meta["target_category"] = target_category
    meta["is_cheating_site"] = is_known_cheating_site
    meta["violation_flags"] = violation_flags
    meta["opened_at"] = opened_at
    meta["closed_at"] = closed_at

    ev = models.IntegrityEvent(
        attempt_id=aid,
        event_type=payload.event_type,
        metadata_json=meta,
    )
    db.add(ev)
    attempt.integrity_score = (attempt.integrity_score or 0) + w
    db.commit()

    broadcast_data = {
        "event": "integrity_event",
        "attempt_id": aid,
        "student_id": user.id,
        "student_name": user.full_name,
        "usn": user.student_ref or f"USN-{user.id[:6].upper()}",
        "section": classroom_name,
        "event_type": payload.event_type,
        "integrity_score": attempt.integrity_score,
        "duration_seconds": duration,
        "target_app_or_url": target,
        "target_category": target_category,
        "focus_status": focus_status,
        "severity": severity,
        "violation_flags": violation_flags,
        "opened_at": opened_at,
        "closed_at": closed_at,
        "metadata": meta,
        "at": now_iso,
    }
    
    try:
        await manager.broadcast_teacher(attempt.exam_id, broadcast_data)
    except Exception:
        pass

    return {
        "ok": True,
        "integrity_score": attempt.integrity_score,
        "severity": severity,
        "focus_status": focus_status,
    }


@router.get("/attempts/{aid}/events")
def list_events(
    aid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = db.query(models.ExamAttempt).filter_by(id=aid).first()
    if not attempt:
        raise HTTPException(404, "Not found")
    if user.role == "student" and attempt.student_id != user.id:
        raise HTTPException(403, "Forbidden")
    events = (
        db.query(models.IntegrityEvent)
        .filter_by(attempt_id=aid)
        .order_by(models.IntegrityEvent.created_at)
        .all()
    )
    return [
        {
            "id": e.id,
            "type": e.event_type,
            "metadata": e.metadata_json,
            "at": e.created_at,
        }
        for e in events
    ]


# ---------- Rich Grading, Manual Adjustment & Regrade Workflows ----------
@router.post("/attempts/{aid}/manual-grade", response_model=schemas.ScoreAdjustmentOut)
def manual_score_adjustment(
    aid: str,
    payload: schemas.ManualGradeIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Manually modifies an attempt score with mandatory justification and immutable audit logging."""
    if not payload.reason.strip():
        raise HTTPException(400, "Mandatory reason required for score adjustment")
    attempt = db.query(models.ExamAttempt).filter_by(id=aid).first()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
        
    prev = attempt.score or 0.0
    diff = round(payload.new_score - prev, 2)
    attempt.score = round(payload.new_score, 2)
    
    adj = models.ScoreAdjustment(
        attempt_id=aid,
        actor_id=user.id,
        previous_score=prev,
        new_score=attempt.score,
        adjustment_amount=diff,
        reason=payload.reason,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    db.add(models.AuditLog(actor_id=user.id, action="grade.manual_adjustment", resource=aid, metadata_json={"prev": prev, "new": attempt.score, "reason": payload.reason}))
    db.commit()
    return adj


@router.get("/attempts/{aid}/grade-history", response_model=list[schemas.ScoreAdjustmentOut])
def get_grade_history(
    aid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    return (
        db.query(models.ScoreAdjustment)
        .filter_by(attempt_id=aid)
        .order_by(models.ScoreAdjustment.created_at.desc())
        .all()
    )


@router.post("/exams/{eid}/regrade-preview")
def regrade_preview(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Calculates diffs across submitted attempts before committing a regrade."""
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
        
    attempts = (
        db.query(models.ExamAttempt)
        .filter_by(exam_id=eid, status="submitted")
        .all()
    )
    diffs = []
    for att in attempts:
        snapshots = {
            s.question_id: s
            for s in db.query(models.AttemptQuestionSnapshot).filter_by(attempt_id=att.id).all()
        }
        answers = {
            a.question_id: a.selected_original_index
            for a in db.query(models.AttemptAnswer).filter_by(attempt_id=att.id).all()
        }
        recalc_score = 0.0
        for qid in att.question_order:
            s = snapshots.get(qid)
            if not s:
                continue
            if s.is_cancelled:
                recalc_score += s.marks
                continue
            sel = answers.get(qid)
            if sel is None:
                continue
            corr = next((i for i, o in enumerate(s.options) if o.get("is_correct")), None)
            if sel == corr:
                recalc_score += s.marks
            elif exam.negative_marking:
                recalc_score -= s.negative_marks
                
        recalc_score = round(recalc_score, 2)
        diffs.append({
            "attempt_id": att.id,
            "student_id": att.student_id,
            "current_score": att.score,
            "recalculated_score": recalc_score,
            "diff": round(recalc_score - (att.score or 0.0), 2),
        })
        
    return {
        "exam_id": eid,
        "total_submitted_attempts": len(attempts),
        "previews": diffs,
    }


@router.post("/exams/{eid}/regrade")
def commit_regrade(
    eid: str,
    reason: str = "Answer key correction / question moderation",
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Commits regrade to all submitted attempts, recording score adjustments."""
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
        
    attempts = (
        db.query(models.ExamAttempt)
        .filter_by(exam_id=eid, status="submitted")
        .all()
    )
    regraded_count = 0
    for att in attempts:
        snapshots = {
            s.question_id: s
            for s in db.query(models.AttemptQuestionSnapshot).filter_by(attempt_id=att.id).all()
        }
        answers = {
            a.question_id: a.selected_original_index
            for a in db.query(models.AttemptAnswer).filter_by(attempt_id=att.id).all()
        }
        recalc_score = 0.0
        for qid in att.question_order:
            s = snapshots.get(qid)
            if not s:
                continue
            if s.is_cancelled:
                recalc_score += s.marks
                continue
            sel = answers.get(qid)
            if sel is None:
                continue
            corr = next((i for i, o in enumerate(s.options) if o.get("is_correct")), None)
            if sel == corr:
                recalc_score += s.marks
            elif exam.negative_marking:
                recalc_score -= s.negative_marks
                
        prev = att.score or 0.0
        new_s = round(recalc_score, 2)
        if prev != new_s:
            att.score = new_s
            adj = models.ScoreAdjustment(
                attempt_id=att.id,
                actor_id=user.id,
                previous_score=prev,
                new_score=new_s,
                adjustment_amount=round(new_s - prev, 2),
                reason=reason,
            )
            db.add(adj)
            regraded_count += 1
            
    db.commit()
    db.add(models.AuditLog(actor_id=user.id, action="exam.regrade_committed", resource=eid, metadata_json={"regraded_attempts": regraded_count, "reason": reason}))
    db.commit()
    return {"ok": True, "regraded_attempts": regraded_count}


@router.post("/exams/{eid}/cancel-question/{qid}")
def cancel_defective_question(
    eid: str,
    qid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Marks a question defective and cancelled in all student attempts for this exam (awarding grace marks)."""
    snapshots = (
        db.query(models.AttemptQuestionSnapshot)
        .join(models.ExamAttempt, models.AttemptQuestionSnapshot.attempt_id == models.ExamAttempt.id)
        .filter(models.ExamAttempt.exam_id == eid, models.AttemptQuestionSnapshot.question_id == qid)
        .all()
    )
    for s in snapshots:
        s.is_cancelled = True
    db.commit()
    db.add(models.AuditLog(actor_id=user.id, action="exam.question_cancelled", resource=f"{eid}:{qid}"))
    db.commit()
    return {"ok": True, "cancelled_in_attempts": len(snapshots)}


@router.post("/attempts/{aid}/reset")
def reset_attempt(
    aid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = db.query(models.ExamAttempt).filter_by(id=aid).first()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if user.role not in ("teacher", "admin", "super_admin") and user.id != attempt.student_id:
        raise HTTPException(403, "Forbidden")

    exam = db.query(models.Exam).filter_by(id=attempt.exam_id).first()
    duration = (exam.duration_minutes if exam and exam.duration_minutes else 60)
    db.query(models.AttemptAnswer).filter_by(attempt_id=aid).delete()
    attempt.status = "in_progress"
    attempt.score = None
    attempt.started_at = datetime.utcnow()
    attempt.expires_at = datetime.utcnow() + timedelta(minutes=duration)
    db.commit()
    return {"ok": True, "attempt_id": aid}

