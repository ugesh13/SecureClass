from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/exams/{eid}")
def exam_analytics(
    eid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    exam = db.query(models.Exam).filter_by(id=eid).first()
    if not exam:
        raise HTTPException(404, "Not found")
    if exam.teacher_id != user.id and user.role != "super_admin":
        raise HTTPException(403, "Forbidden")
    attempts = db.query(models.ExamAttempt).filter_by(exam_id=eid).all()
    submitted = [a for a in attempts if a.status == "submitted"]
    scores = [a.score or 0 for a in submitted]
    # Topic-level analytics
    topic_stats = {}
    qs = {}
    if exam.question_ids:
        qs = {
            q.id: q
            for q in db.query(models.Question)
            .filter(models.Question.id.in_(exam.question_ids))
            .all()
        }
    for att in submitted:
        answers = {
            a.question_id: a.selected_original_index
            for a in db.query(models.AttemptAnswer).filter_by(attempt_id=att.id).all()
        }
        for qid in att.question_order:
            q = qs.get(qid)
            if not q or not q.topic:
                continue
            topic_stats.setdefault(q.topic, {"correct": 0, "total": 0})
            topic_stats[q.topic]["total"] += 1
            correct_idx = next(
                (i for i, o in enumerate(q.options) if o.get("is_correct")), None
            )
            if answers.get(qid) == correct_idx:
                topic_stats[q.topic]["correct"] += 1
    topic_pct = {
        t: round(100 * v["correct"] / v["total"], 1) if v["total"] else 0
        for t, v in topic_stats.items()
    }
    return {
        "exam_id": eid,
        "attempts": len(attempts),
        "submitted": len(submitted),
        "average": round(sum(scores) / len(scores), 2) if scores else 0,
        "highest": max(scores) if scores else 0,
        "lowest": min(scores) if scores else 0,
        "pass_rate": (
            round(
                100
                * sum(1 for s in scores if s >= 0.4 * (exam.total_marks or 1))
                / len(scores),
                1,
            )
            if scores
            else 0
        ),
        "topic_performance": topic_pct,
        "weak_topics": [
            t for t, p in sorted(topic_pct.items(), key=lambda x: x[1]) if p < 60
        ][:5],
        "integrity_summary": {
            "flagged": sum(1 for a in attempts if (a.integrity_score or 0) >= 4),
            "review": sum(1 for a in attempts if 2 <= (a.integrity_score or 0) < 4),
        },
    }


@router.get("/classes/{cid}")
def class_analytics(
    cid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    exams = db.query(models.Exam).filter_by(classroom_id=cid).all()
    return {
        "classroom_id": cid,
        "exams": len(exams),
        "avg_score": (
            round(sum(e.total_marks for e in exams) / len(exams), 2) if exams else 0
        ),
    }


@router.get("/students/me")
def my_analytics(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempts = (
        db.query(models.ExamAttempt)
        .filter_by(student_id=user.id, status="submitted")
        .all()
    )
    if not attempts:
        return {"attempts": 0, "average_pct": 0, "by_exam": [], "weak_topics": []}
    by_exam = []
    topic_agg = {}
    for a in attempts:
        exam = db.query(models.Exam).filter_by(id=a.exam_id).first()
        pct = round(100 * (a.score or 0) / (a.total_marks or 1), 1)
        by_exam.append(
            {
                "exam_id": exam.id if exam else a.exam_id,
                "title": exam.title if exam else "Unknown Exam",
                "score": a.score,
                "total": a.total_marks,
                "pct": pct,
                "at": a.submitted_at,
            }
        )
        qs = {}
        if a.question_order:
            qs = {
                q.id: q
                for q in db.query(models.Question)
                .filter(models.Question.id.in_(a.question_order))
                .all()
            }
        answers = {
            x.question_id: x.selected_original_index
            for x in db.query(models.AttemptAnswer).filter_by(attempt_id=a.id).all()
        }
        for qid in a.question_order:
            q = qs.get(qid)
            if not q or not q.topic:
                continue
            topic_agg.setdefault(q.topic, {"c": 0, "t": 0})
            topic_agg[q.topic]["t"] += 1
            correct_idx = next(
                (i for i, o in enumerate(q.options) if o.get("is_correct")), None
            )
            if answers.get(qid) == correct_idx:
                topic_agg[q.topic]["c"] += 1
    topic_pct = {
        t: round(100 * v["c"] / v["t"], 1) for t, v in topic_agg.items() if v["t"]
    }
    weak = [t for t, p in sorted(topic_pct.items(), key=lambda x: x[1]) if p < 60]
    return {
        "attempts": len(attempts),
        "average_pct": (
            round(sum(x["pct"] for x in by_exam) / len(by_exam), 1) if by_exam else 0
        ),
        "by_exam": by_exam,
        "topic_performance": topic_pct,
        "weak_topics": weak,
    }
