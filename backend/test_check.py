import requests
import time

BASE_URL = "http://127.0.0.1:8000"

# 1. Login as Teacher
teacher_login = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "teacher@secureclass.local",
    "password": "Password123!"
}).json()
teacher_token = teacher_login.get("access_token")
print("Teacher login:", "OK" if teacher_token else "FAILED")

headers_teacher = {"Authorization": f"Bearer {teacher_token}"}

# Get list of exams
exams = requests.get(f"{BASE_URL}/exams", headers=headers_teacher).json()
print(f"Fetched {len(exams)} exams.")

# Find or create active exam
active_exam = None
for ex in exams:
    if ex.get("status") == "active":
        active_exam = ex
        break

if not active_exam:
    # Start the first exam
    first_id = exams[0]["id"]
    res = requests.post(f"{BASE_URL}/exams/{first_id}/start?expires_minutes=60", headers=headers_teacher)
    active_exam = res.json()
    print("Started exam:", active_exam.get("id"))
else:
    print("Using active exam:", active_exam.get("id"))

exam_id = active_exam["id"]

# 2. Login as Student
student_login = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "student1@secureclass.local",
    "password": "Password123!"
}).json()
student_token = student_login.get("access_token")
print("Student login:", "OK" if student_token else "FAILED")
headers_student = {"Authorization": f"Bearer {student_token}"}

# Get student me
me = requests.get(f"{BASE_URL}/analytics/students/me", headers=headers_student).json()
student_id = me["student"]["id"]
print(f"Student: {me['student']['full_name']} (USN: {me['student'].get('student_ref')})")

# Join / get attempt for exam
join_res = requests.post(f"{BASE_URL}/exams/join", json={"exam_id": exam_id}, headers=headers_student)
attempt_data = join_res.json()
attempt_id = attempt_data.get("attempt_id")
print("Joined exam, attempt_id:", attempt_id)

# 3. Simulate Student Tab Departed & Returned with rich duration and target URL
print("\n--- Simulating Tab Switch Away ---")
depart_event = {
    "event_type": "STUDENT_DEPARTED",
    "metadata": {
        "focus_status": "AWAY",
        "target_app_or_url": "chatgpt.com",
        "severity": "CRITICAL"
    }
}
r1 = requests.post(f"{BASE_URL}/attempts/{attempt_id}/events", json=depart_event, headers=headers_student)
print("Depart event status:", r1.status_code)

# Check Live Roster on Teacher side during departure
roster_mid = requests.get(f"{BASE_URL}/exams/{exam_id}/live-roster", headers=headers_teacher).json()
st_in_roster = next((s for s in roster_mid if s["student_id"] == student_id), None)
print(f"During departure: Focus Status = {st_in_roster.get('focus_status')}, Switches = {st_in_roster.get('total_switches')}, Target = {st_in_roster.get('last_target')}")
assert st_in_roster.get("focus_status") == "AWAY", "Expected focus status AWAY"

print("\n--- Simulating Student Return after 8.5s ---")
return_event = {
    "event_type": "STUDENT_RETURNED",
    "metadata": {
        "duration_seconds": 8.5,
        "focus_status": "FOCUSED",
        "target_app_or_url": "chatgpt.com",
        "severity": "HIGH"
    }
}
r2 = requests.post(f"{BASE_URL}/attempts/{attempt_id}/events", json=return_event, headers=headers_student)
print("Return event status:", r2.status_code)

# Check Live Roster on Teacher side after return
roster_after = requests.get(f"{BASE_URL}/exams/{exam_id}/live-roster", headers=headers_teacher).json()
st_after = next((s for s in roster_after if s["student_id"] == student_id), None)
print(f"After return: Focus Status = {st_after.get('focus_status')}, Switches = {st_after.get('total_switches')}, Away Secs = {st_after.get('accumulated_away_seconds')}, Risk Score = {st_after.get('risk_score')} ({st_after.get('threat_level')})")
assert st_after.get("focus_status") == "FOCUSED", "Expected focus status FOCUSED"
assert st_after.get("accumulated_away_seconds") >= 8.5, "Expected accumulated away seconds >= 8.5"

# 4. Test Moderation Controls: Warn, Pause, Resume
print("\n--- Testing Teacher Moderation Controls ---")
warn_res = requests.post(
    f"{BASE_URL}/exams/{exam_id}/students/{student_id}/warn",
    json={"announcement": "Warning: External tabs are flagged for review!"},
    headers=headers_teacher
)
print("Warn student response:", warn_res.json())
assert warn_res.json().get("ok") is True

pause_res = requests.post(
    f"{BASE_URL}/exams/{exam_id}/students/{student_id}/pause",
    headers=headers_teacher
)
print("Pause student response:", pause_res.json())
assert pause_res.json().get("status") == "paused"

resume_res = requests.post(
    f"{BASE_URL}/exams/{exam_id}/students/{student_id}/resume",
    headers=headers_teacher
)
print("Resume student response:", resume_res.json())
assert resume_res.json().get("status") == "approved"

print("\nALL BACKEND & TELEMETRY CHECKS PASSED SUCCESSFULLY!")
