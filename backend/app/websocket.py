import json
from typing import Dict, Set
from fastapi import WebSocket


class ExamConnectionManager:
    """In-memory pub/sub for exam live monitoring. Redis pub/sub for scale."""

    def __init__(self):
        self.teacher_rooms: Dict[str, Set[WebSocket]] = {}
        self.student_rooms: Dict[str, Set[WebSocket]] = {}

    async def connect_teacher(self, exam_id: str, ws: WebSocket):
        await ws.accept()
        self.teacher_rooms.setdefault(exam_id, set()).add(ws)

    async def connect_student(self, exam_id: str, ws: WebSocket):
        await ws.accept()
        self.student_rooms.setdefault(exam_id, set()).add(ws)

    def disconnect_teacher(self, exam_id: str, ws: WebSocket):
        if exam_id in self.teacher_rooms:
            self.teacher_rooms[exam_id].discard(ws)

    def disconnect_student(self, exam_id: str, ws: WebSocket):
        if exam_id in self.student_rooms:
            self.student_rooms[exam_id].discard(ws)

    async def broadcast_teacher(self, exam_id: str, message: dict):
        dead = []
        for ws in self.teacher_rooms.get(exam_id, set()):
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.teacher_rooms[exam_id].discard(ws)

    async def broadcast_students(self, exam_id: str, message: dict):
        dead = []
        for ws in self.student_rooms.get(exam_id, set()):
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.student_rooms[exam_id].discard(ws)

    async def broadcast_all(self, exam_id: str, message: dict):
        await self.broadcast_teacher(exam_id, message)
        await self.broadcast_students(exam_id, message)


manager = ExamConnectionManager()
