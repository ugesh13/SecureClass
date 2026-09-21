from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db, engine
from .. import models, schemas
from ..security import hash_password, verify_password, create_access_token
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=schemas.TokenOut)
def register(payload: schemas.RegisterIn, db: Session = Depends(get_db)):
    clean_email = payload.email.strip().lower()
    if db.query(models.User).filter(models.User.email == clean_email).first():
        raise HTTPException(400, "An account with this email address already exists. Please sign in instead.")
    inst = None
    if payload.role in ("teacher", "admin") and payload.institution_name:
        inst = models.Institution(name=payload.institution_name)
        db.add(inst)
        db.flush()
    user = models.User(
        email=clean_email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role if payload.role in ("teacher", "student", "admin") else "student",
        student_ref=payload.student_ref.strip() if payload.student_ref else None,
        institution_id=inst.id if inst else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
    }


@router.post("/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(user.id, user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
    }


@router.post("/logout")
def logout():
    return {"ok": True}


@users_router.get("/me")
def me(user: models.User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "student_ref": user.student_ref,
        "institution_id": user.institution_id,
    }


@users_router.put("/me")
def update_me(
    payload: dict,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if "full_name" in payload and payload["full_name"]:
        user.full_name = payload["full_name"].strip()
    if "student_ref" in payload:
        user.student_ref = payload["student_ref"].strip() if payload["student_ref"] else None
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "student_ref": user.student_ref,
        "institution_id": user.institution_id,
    }


@users_router.get("")
def list_users(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles("admin", "super_admin")),
):
    """Admin-only: list all platform users."""
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "student_ref": u.student_ref,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() + "Z" if u.created_at else None,
        }
        for u in users
    ]


@users_router.get("/admin/overview")
def admin_overview(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles("admin", "super_admin")),
):
    """Admin-only: platform telemetry and health metrics."""
    total_users = db.query(models.User).count()
    teachers = db.query(models.User).filter_by(role="teacher").count()
    students = db.query(models.User).filter_by(role="student").count()
    admins = db.query(models.User).filter(models.User.role.in_(["admin", "super_admin"])).count()
    total_exams = db.query(models.Exam).count()
    active_exams = db.query(models.Exam).filter_by(status="active").count()
    total_attempts = db.query(models.ExamAttempt).count()
    total_questions = db.query(models.Question).count()

    db_host = getattr(engine.url, "host", "Neon PostgreSQL Cloud")
    db_name = getattr(engine.url, "database", "neondb")

    return {
        "users": {
            "total": total_users,
            "teachers": teachers,
            "students": students,
            "admins": admins,
        },
        "exams": {
            "total": total_exams,
            "active": active_exams,
            "questions": total_questions,
            "attempts": total_attempts,
        },
        "database": {
            "type": "PostgreSQL (Neon Cloud)",
            "host": db_host or "Neon Cloud",
            "database": db_name,
            "status": "Healthy & Connected",
            "ssl": "require",
        },
    }


@users_router.get("/admin/audit-logs")
def get_audit_logs(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles("admin", "super_admin")),
):
    """Admin-only: list recent platform audit events."""
    logs = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(30).all()
    return [
        {
            "id": l.id,
            "actor_id": l.actor_id,
            "action": l.action,
            "resource": l.resource,
            "created_at": l.created_at.isoformat() + "Z" if l.created_at else None,
        }
        for l in logs
    ]


@users_router.put("/{uid}/role")
def update_user_role(
    uid: str,
    payload: dict,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles("admin", "super_admin")),
):
    """Admin-only: update user role."""
    new_role = payload.get("role")
    if new_role not in ("student", "teacher", "admin", "super_admin"):
        raise HTTPException(400, "Invalid role")
    user = db.query(models.User).filter_by(id=uid).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.role = new_role
    db.add(models.AuditLog(actor_id=admin.id, action=f"user.role_changed_to_{new_role}", resource=uid))
    db.commit()
    return {"ok": True, "id": uid, "role": new_role}


@users_router.put("/{uid}/toggle-status")
def toggle_user_status(
    uid: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles("admin", "super_admin")),
):
    """Admin-only: activate or disable user account."""
    user = db.query(models.User).filter_by(id=uid).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = not user.is_active
    action = "user.activated" if user.is_active else "user.disabled"
    db.add(models.AuditLog(actor_id=admin.id, action=action, resource=uid))
    db.commit()
    return {"ok": True, "id": uid, "is_active": user.is_active}

