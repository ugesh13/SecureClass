from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from .config import settings
from .database import Base, engine, get_db, run_auto_migrations
from . import models
from .security import decode_token
from .websocket import manager
from .routers import accommodations, analytics, attempts, auth, classrooms, exams, questions

Base.metadata.create_all(bind=engine)
run_auto_migrations(engine)

app = FastAPI(title="SecureClass API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(auth.users_router)
app.include_router(classrooms.router)
app.include_router(questions.router)
app.include_router(exams.router)
app.include_router(attempts.router)
app.include_router(analytics.router)
app.include_router(accommodations.router)


@app.get("/")
def root():
    return {"name": "SecureClass", "status": "ok"}


@app.get("/health")
def health():
    return {"ok": True}


# ---------- WebSocket ----------
@app.websocket("/ws/exams/{exam_id}/teacher")
async def ws_teacher(ws: WebSocket, exam_id: str, token: str = ""):
    payload = decode_token(token) if token else None
    if not payload:
        await ws.close(code=4401)
        return
    db = next(get_db())
    try:
        user = db.query(models.User).filter_by(id=payload["sub"]).first()
        if not user or user.role not in ("teacher", "admin", "super_admin"):
            await ws.close(code=4403)
            return
        exam = db.query(models.Exam).filter_by(id=exam_id).first()
        if not exam or (exam.teacher_id != user.id and user.role != "super_admin"):
            await ws.close(code=4403)
            return
        await manager.connect_teacher(exam_id, ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            manager.disconnect_teacher(exam_id, ws)
    finally:
        db.close()


@app.websocket("/ws/exams/{exam_id}/student/{attempt_id}")
async def ws_student(ws: WebSocket, exam_id: str, attempt_id: str, token: str = ""):
    payload = decode_token(token) if token else None
    if not payload:
        await ws.close(code=4401)
        return
    db = next(get_db())
    try:
        attempt = db.query(models.ExamAttempt).filter_by(id=attempt_id).first()
        if not attempt or attempt.student_id != payload["sub"]:
            await ws.close(code=4403)
            return
        await manager.connect_student(exam_id, ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            manager.disconnect_student(exam_id, ws)
    finally:
        db.close()
