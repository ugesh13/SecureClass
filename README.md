# SecureClass

"Create. Conduct. Monitor. Evaluate. Improve."

Classroom-first online assessment platform.

This MVP implements:
- JWT auth with roles (teacher/student/admin)
- Classrooms + roster
- Question bank
- Exams with randomized question/option order (server-side)
- Temporary QR-based join sessions
- Server-authoritative timer
- Autosave + offline queue
- Browser integrity events (tab, fullscreen, copy/paste, context menu, reload)
- WebSocket live teacher monitoring
- Server-side auto-evaluation
- Student and exam analytics with weak-topic detection

## Run Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend at http://localhost:5173

## Demo Flow

1. Register as teacher → `/register`
2. Create questions via API or (future) UI
3. Create exam → Start → QR shown
4. Register a student in a second browser
5. Student pastes the access token → takes exam
6. Teacher opens `/teacher/exams/:id/monitor` to see live events
7. Student submits → result computed server-side

## Honest Limitations

SecureClass performs **browser-level** integrity monitoring only. It does **not** claim OS-level lockdown. It cannot prevent:
- Alt+Tab at the OS level
- Screenshots taken by the OS
- Use of a second device
- Physical notes

A future **SecureClass Exam Client** (kiosk mode) can extend this with an `ExamSecurityProvider` abstraction — see docs.

## Roadmap & Assessment Intelligence Vision

SecureClass is evolving from a secure quiz platform into a full **assessment intelligence and learning-improvement platform**.

Full details, architecture, and feature breakdowns are documented in **[ROADMAP.md](ROADMAP.md)**.

### Phase 1: Make the MVP Dependable
- Exam templates, reusable workflows, and exam duplication
- Question lifecycle (draft, review, approved, published) & immutable snapshots
- Assessment blueprint and coverage validation (Bloom's taxonomy, difficulty targets)
- Rich grading, manual score adjustment, bulk regrading, and audit trails
- Emergency exam controls (pause, extend, re-entry window)
- Privacy center, retention configuration, and teacher/admin MFA
- Observability dashboards and correlation IDs

### Phase 2: Improve Learning Outcomes
- Student feedback center with actionable review
- Student mastery model by topic and learning objective
- Distractor misconception detection & confidence-based answering
- Adaptive practice mode & spaced revision study plans
- Accessibility accommodations (extra time, high-contrast, screen-reader support)
- Multi-language and localization foundation

### Phase 3: Institutional Adoption
- Co-teachers, role-based access permissions, and shared question banks
- Google Classroom, Microsoft Teams, and LMS (LTI 1.3) integrations
- Bulk roster sync, calendar integration, and event-driven notifications
- Institution branding, academic terms, and usage metering

### Phase 4: Advanced Assessment Platform
- Multi-format question types (true/false, numerical, short-answer)
- Collaborative assessment formats (peer review, team quizzes)
- Item statistics, calibration, and IRT-style discrimination analysis
- Dedicated Secure-Client / Kiosk integration architecture

## Quick Start Commands

```bash
# terminal 1 (Backend)
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload

# terminal 2 (Frontend)
cd frontend && npm install && npm run dev

# terminal 3 (Optional, if using Postgres)
docker compose up -d db
```
