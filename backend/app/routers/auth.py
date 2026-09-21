from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..security import hash_password, verify_password, create_access_token
from ..deps import get_current_user

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
