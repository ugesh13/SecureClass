from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..deps import get_current_user, require_roles

router = APIRouter(tags=["accommodations_and_privacy"])


@router.get("/students/{student_id}/accommodation", response_model=schemas.StudentAccommodationOut)
def get_student_accommodation(
    student_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role == "student" and user.id != student_id:
        raise HTTPException(403, "Forbidden")
    acc = db.query(models.StudentAccommodation).filter_by(student_id=student_id).first()
    if not acc:
        # Default baseline accommodation
        return schemas.StudentAccommodationOut(
            id="default",
            student_id=student_id,
            extra_time_multiplier=1.0,
            extra_time_minutes=0,
            high_contrast=False,
            large_text=False,
            notes=None,
        )
    return acc


@router.put("/students/{student_id}/accommodation", response_model=schemas.StudentAccommodationOut)
def update_student_accommodation(
    student_id: str,
    payload: schemas.StudentAccommodationIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles("teacher", "admin", "super_admin")),
):
    """Sets accessibility accommodations (extra time, high contrast) for a student."""
    acc = db.query(models.StudentAccommodation).filter_by(student_id=student_id).first()
    if not acc:
        acc = models.StudentAccommodation(student_id=student_id, **payload.model_dump())
        db.add(acc)
    else:
        for k, v in payload.model_dump().items():
            setattr(acc, k, v)
    db.commit()
    db.refresh(acc)
    db.add(models.AuditLog(actor_id=user.id, action="accommodation.updated", resource=student_id, metadata_json=payload.model_dump()))
    db.commit()
    return acc


# ---------- Privacy Center & Transparency ----------
@router.get("/privacy/disclosure")
def get_privacy_disclosure():
    """Returns transparent explainability of all collected integrity telemetry."""
    return {
        "title": "SecureClass Integrity Transparency & Privacy Notice",
        "purpose": "SecureClass monitors client browser viewport activity during high-stakes exams to uphold academic integrity without invasive kernel drivers or unconsented webcam surveillance.",
        "events_collected": [
            {
                "event": "TAB_OR_WINDOW_LEFT",
                "description": "Triggered when student navigates away from the exam tab or switches application focus.",
                "reasons": "Detects unauthorized external referencing during an active test session.",
                "limitations": "May occasionally trigger from accidental clicks or background OS popups."
            },
            {
                "event": "FULLSCREEN_EXIT",
                "description": "Triggered when browser exits full-screen mode.",
                "reasons": "Maintains dedicated testing window.",
                "limitations": "Operating system hotkeys or hardware alerts may trigger exit."
            },
            {
                "event": "COPY_PASTE_ATTEMPT",
                "description": "Triggered when keyboard clipboard copy or paste shortcuts are used.",
                "reasons": "Prevents copying questions out or pasting answers in.",
                "limitations": "Browser extensions can occasionally emit paste events."
            },
            {
                "event": "PAGE_RELOAD",
                "description": "Triggered when browser page is refreshed.",
                "reasons": "Ensures server timer continuity and detects session resets.",
                "limitations": "Browser auto-refresh or connection loss can cause reloads."
            }
        ],
        "retention_policy": "Telemetry records are preserved for 90 days following term completion, after which events are permanently anonymized and archived.",
        "who_can_view": ["Assigned classroom teachers", "Institution examination proctors"],
        "student_rights": [
            "Right to view recorded events during score review",
            "Right to file an appeal with written context for anomalous alerts",
            "Right to request approved accommodations before exam commencement"
        ]
    }


@router.post("/privacy/consent")
def record_privacy_consent(
    exam_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    consent = models.PrivacyConsent(
        user_id=user.id,
        exam_id=exam_id,
        consent_version="1.0",
    )
    db.add(consent)
    db.commit()
    return {"ok": True, "acknowledged_at": consent.acknowledged_at}
