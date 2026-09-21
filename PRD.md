# Product Requirements Document (PRD) — SecureClass

**Version:** 1.0.0  
**Status:** Active / In Development  
**Product:** SecureClass (Classroom-First Assessment Intelligence & Integrity Platform)  
**Target Audience:** Educational Institutions, Faculty/Teachers, Students, and Academic Administrators

---

## 1. Executive Summary & Vision

**SecureClass** is a modern, classroom-first online assessment platform engineered to transform examinations from mere evaluation checkpoints into comprehensive learning-intelligence feedback loops.

### Value Proposition
- **For Instructors:** Streamlined exam composition, assessment blueprint validation (Bloom's taxonomy & topic balance), automated real-time integrity monitoring, instant automated grading with manual override workflows, and weak-topic analytics.
- **For Students:** Distraction-free, resilient testing experience with offline queue autosave, instant recovery, transparent feedback, and personalized remedial pathways.
- **For Institutions:** Role-based access control (RBAC), multi-tenancy, immutable audit trails, and data sovereignty without requiring intrusive OS-level spyware.

---

## 2. Key Problem Statement

Traditional online assessment software suffers from:
1. **Fragile Client Connections:** Network dropouts cause lost answers or failed submissions.
2. **Invasive Lockdown Software:** Heavy kernel-level proctoring tools breach student privacy and create severe friction.
3. **Disconnected Learning Loops:** Exams produce a single percentage grade without identifying specific cognitive misconceptions or offering targeted remediation.
4. **Teacher Burden:** Assembling balanced question papers, managing randomized variants, and grading is excessively time-consuming.

---

## 3. User Personas

| Persona | Role | Key Goals & Needs |
| :--- | :--- | :--- |
| **Dr. Jane Doe** | Faculty / Teacher | Wants to draft blueprints, author & version questions, conduct live-monitored exams, and review auto-graded results with misconception insights. |
| **Alex Chen** | Student / Examinee | Needs a smooth, high-clarity exam interface that survives network blips, with transparent timers and clear post-exam feedback. |
| **Dean Miller** | Institution Admin | Requires institutional governance, teacher access provisioning, audit compliance logs, and cross-department academic metrics. |

---

## 4. Core Feature Requirements

### 4.1 Authentication & Multi-Tenancy
- **JWT-Based Authentication:** Access and refresh token flows with role claims (`student`, `teacher`, `admin`, `super_admin`).
- **Institutional Hierarchies:** Multi-tenant support binding classrooms, teachers, and question banks to institutions.
- **QR / Token Join Sessions:** Ephemeral 6-character access codes and QR codes for frictionless student exam check-ins.

### 4.2 Question Bank & Lifecycle Management
- **Taxonomy & Metadata:** Questions categorized by subject, topic, difficulty (`easy`, `medium`, `hard`), and Bloom's taxonomy (`remember`, `understand`, `apply`, `analyze`, `evaluate`).
- **Question Types:** Multiple Choice Questions (MCQ), Multi-Select, True/False, Numerical, Short Answer.
- **Lifecycle States:** `draft` → `in_review` → `approved` → `published` → `archived`.
- **Misconception Tagging:** Association of specific distractor choices with common cognitive traps.

### 4.3 Exam Authoring & Blueprint Validation
- **Assessment Blueprints:** Definition of topic quotas, Bloom's level distributions, and difficulty weights.
- **Dynamic & Static Composition:** Support for fixed question lists or randomized selection from banked pools.
- **Configurable Integrity Controls:** Enforce fullscreen mode, block copy/paste, detect tab switching, and record window blur events.

### 4.4 Resilient Exam Delivery (Student Experience)
- **Server-Authoritative Clock:** Prevents client clock manipulation and guarantees exact time limits.
- **Local Autosave & Offline Queue:** IndexedDB/LocalStorage queue guaranteeing zero answer loss during intermittent internet outages.
- **Anti-Cheat Integrity Watchdog:** Client-side detection of tab changes, fullscreen departures, devtool openings, and clipboard actions sent in heartbeat payloads.

### 4.5 Live Proctoring & Real-Time Monitoring
- **WebSocket Broadcast Engine:** Instant event streaming from examinees to the teacher's live monitor dashboard.
- **Status Indicators:** Real-time visibility into student progress, active question, connection heartbeats, and flagged anomalies.
- **Live Interventions:** Teacher capability to broadcast notices, grant time extensions, or terminate suspicious sessions.

### 4.6 Auto-Grading, Analytics & Remediation
- **Server-Side Auto-Evaluation:** Instant score calculation with negative marking support.
- **Misconception & Weak-Topic Detection:** Automated generation of class-wide and student-specific weakness matrices.
- **Remedial Practice Quizzes:** Dynamic generation of targeted practice quizzes targeting identified concept deficiencies.

---

## 5. Non-Functional Requirements

- **Availability & Performance:** Sub-100ms API response latency for heartbeat and save actions; 99.9% uptime during active exam sessions.
- **Security & Privacy:** Passwords hashed with bcrypt/Argon2; CORS headers restricted; zero persistent webcam/screen spying recording.
- **Responsive & Accessible:** Fully responsive design tested across tablet, desktop, and mobile; WCAG AA contrast compliance and reduced-motion modes.
- **Scalability:** Stateless backend services capable of horizontal scaling with Redis-backed WebSockets.
