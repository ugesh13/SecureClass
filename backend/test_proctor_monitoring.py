"""Verification script for exam monitoring and tab-tracking features using standard urllib."""
import urllib.request
import urllib.error
import json

BASE_URL = "http://127.0.0.1:8000"

def request(method, path, data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            content_type = response.headers.get("Content-Type", "")
            return response.status, res_body, content_type
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8"), ""

def run_tests():
    print("Testing proctor monitoring & tab-tracking features against live server...")
    import time
    ts = int(time.time())

    # 1. Register teacher
    code, text, _ = request("POST", "/auth/register", {
        "email": f"teacher_{ts}@secureclass.internal",
        "password": "Password123!",
        "full_name": "Prof. Charles Babbage",
        "role": "teacher"
    })
    t_token = json.loads(text)["access_token"]

    # 2. Register student with USN
    code, text, _ = request("POST", "/auth/register", {
        "email": f"student_{ts}@secureclass.internal",
        "password": "Password123!",
        "full_name": "Ada Lovelace",
        "role": "student",
        "student_ref": "USN-2026-CS-001"
    })
    s_token = json.loads(text)["access_token"]

    # 3. Create question & exam
    code, text, _ = request("POST", "/questions", {
        "text": "What does CPU stand for?",
        "options": [
            {"text": "Central Processing Unit", "is_correct": True},
            {"text": "Computer Power Unit", "is_correct": False}
        ],
        "marks": 2.0,
        "subject": "Computer Science"
    }, token=t_token)
    qid = json.loads(text)["id"]

    code, text, _ = request("POST", "/exams", {
        "title": "Operating Systems & Architecture Midterm",
        "duration_minutes": 45,
        "question_ids": [qid],
        "security_mode": "classroom"
    }, token=t_token)
    eid = json.loads(text)["id"]

    # Start exam
    request("POST", f"/exams/{eid}/start", token=t_token)

    # 4. Student joins
    code, text, _ = request("POST", "/exams/join", {"exam_id": eid}, token=s_token)
    assert code == 200, f"Join failed: {text}"
    aid = json.loads(text)["attempt_id"]
    print(f"[PASS] Student Ada Lovelace joined attempt {aid}")

    # 5. Log departure to ChatGPT (AI Cheating Site)
    code, text, _ = request("POST", f"/attempts/{aid}/events", {
        "event_type": "STUDENT_DEPARTED",
        "metadata": {
            "status": "AWAY",
            "departure_timestamp": "2026-09-21T14:35:00Z",
            "target_app_or_url": "https://chatgpt.com/c/os-midterm-answers",
            "reason": "TAB_SWITCH"
        }
    }, token=s_token)
    assert code == 200, f"Departure event failed: {text}"
    print("[PASS] STUDENT_DEPARTED event recorded with exact ChatGPT target URL")

    # 6. Log return after 28.5s
    code, text, _ = request("POST", f"/attempts/{aid}/events", {
        "event_type": "STUDENT_RETURNED",
        "metadata": {
            "status": "FOCUSED",
            "departure_timestamp": "2026-09-21T14:35:00Z",
            "return_timestamp": "2026-09-21T14:35:28.5Z",
            "duration_seconds": 28.5,
            "target_app_or_url": "https://chatgpt.com/c/os-midterm-answers",
            "reason": "TAB_RETURN"
        }
    }, token=s_token)
    assert code == 200, f"Return event failed: {text}"
    print("[PASS] STUDENT_RETURNED event recorded (28.5s duration, severity auto-rated)")

    # 7. Verify Teacher Live Roster reflects student status, target, and flags
    code, text, _ = request("GET", f"/exams/{eid}/live-roster", token=t_token)
    assert code == 200
    roster = json.loads(text)
    assert len(roster) >= 1
    st = [s for s in roster if s["attempt_id"] == aid][0]
    assert st["student_name"] == "Ada Lovelace"
    assert st["usn"] == "USN-2026-CS-001"
    assert st["has_cheating_site"] is True
    assert st["threat_level"] == "CRITICAL"
    assert "chatgpt.com" in st["last_target"]
    assert len(st["recent_events"]) >= 2
    ev0 = st["recent_events"][0]
    assert ev0["opened_at"] is not None
    print(f"[PASS] Teacher Live Roster verified: USN={st['usn']}, Target={st['last_target']}, Threat={st['threat_level']}")

    # 8. Test Proctor Report (CSV Export)
    code, text, ctype = request("GET", f"/exams/{eid}/proctor-report?format=csv", token=t_token)
    assert code == 200
    assert "text/csv" in ctype
    assert "Ada Lovelace" in text
    assert "USN-2026-CS-001" in text
    assert "CRITICAL" in text
    print("[PASS] Proctor CSV Audit Report generated and verified with candidate records")

    print("\n========================================================")
    print("ALL MONITORING & TAB-TRACKING SYSTEM CHECKS PASSED!")
    print("========================================================")

if __name__ == "__main__":
    run_tests()
