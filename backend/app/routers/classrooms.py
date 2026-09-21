from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/classrooms", tags=["classrooms"])


def _classroom_out(c: models.Classroom, db: Session):
    count = db.query(models.ClassroomMember).filter_by(classroom_id=c.id).count()
    return schemas.ClassroomOut(
        id=c.id,
        name=c.name,
        subject=c.subject,
        section=c.section,
        academic_year=c.academic_year,
        description=c.description,
        teacher_id=c.teacher_id,
        member_count=count,
    )


@router.post("", response_model=schemas.ClassroomOut)
def create_classroom(
    payload: schemas.ClassroomIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    c = models.Classroom(
        **payload.model_dump(),
        teacher_id=user.id,
        institution_id=user.institution_id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _classroom_out(c, db)


@router.get("", response_model=list[schemas.ClassroomOut])
def list_classrooms(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.Classroom)
    if user.role in ("teacher", "admin", "super_admin"):
        if user.role == "teacher":
            q = q.filter(models.Classroom.teacher_id == user.id)
    else:
        q = q.join(
            models.ClassroomMember,
            models.ClassroomMember.classroom_id == models.Classroom.id,
        ).filter(models.ClassroomMember.student_id == user.id)
    return [_classroom_out(c, db) for c in q.all()]


@router.get("/{cid}", response_model=schemas.ClassroomOut)
def get_classroom(
    cid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    c = db.query(models.Classroom).filter_by(id=cid).first()
    if not c:
        raise HTTPException(404, "Not found")
    return _classroom_out(c, db)


@router.post("/{cid}/students")
def add_students(
    cid: str,
    payload: schemas.AddStudentsIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    c = db.query(models.Classroom).filter_by(id=cid).first()
    if not c:
        raise HTTPException(404, "Classroom not found")
    if c.teacher_id != user.id and user.role not in ("admin", "super_admin"):
        raise HTTPException(403, "Not your classroom")
    created, errors = [], []
    for row in payload.students:
        email = (row.get("email") or "").lower().strip()
        if not email:
            errors.append({"row": row, "error": "Missing email"})
            continue
        student = db.query(models.User).filter_by(email=email).first()
        if not student:
            student = models.User(
                email=email,
                hashed_password="",
                full_name=row.get("full_name") or email.split("@")[0],
                role="student",
                student_ref=row.get("student_ref"),
                institution_id=user.institution_id,
                is_active=True,
            )
            db.add(student)
            db.flush()
        exists = (
            db.query(models.ClassroomMember)
            .filter_by(classroom_id=cid, student_id=student.id)
            .first()
        )
        if exists:
            errors.append({"row": row, "error": "Already a member"})
            continue
        db.add(models.ClassroomMember(classroom_id=cid, student_id=student.id))
        created.append({"id": student.id, "email": student.email})
    db.commit()
    return {"created": created, "errors": errors}


@router.get("/{cid}/students")
def list_students(
    cid: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    members = db.query(models.ClassroomMember).filter_by(classroom_id=cid).all()
    return [
        {
            "id": m.student.id,
            "email": m.student.email,
            "full_name": m.student.full_name,
            "student_ref": m.student.student_ref,
            "joined_at": m.joined_at,
        }
        for m in members
    ]
