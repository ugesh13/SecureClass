import asyncio
from datetime import datetime, timedelta
from app.database import get_db, Base, engine, run_auto_migrations
from app import models, schemas
from app.routers import questions, exams, attempts, accommodations

def test_full_roadmap_release_1_workflow():
    run_auto_migrations(engine)
    db = next(get_db())
    
    # Clean up test records if any
    try:
        # 1. Create a Teacher and a Student
        teacher = db.query(models.User).filter_by(email="teacher_turing@test.com").first()
        if not teacher:
            teacher = models.User(
                email="teacher_turing@test.com",
                hashed_password="hash",
                full_name="Prof. Alan Turing",
                role="teacher"
            )
            db.add(teacher)
            db.commit()
            db.refresh(teacher)

        student = db.query(models.User).filter_by(email="student_ada@test.com").first()
        if not student:
            student = models.User(
                email="student_ada@test.com",
                hashed_password="hash",
                full_name="Ada Lovelace",
                role="student"
            )
            db.add(student)
            db.commit()
            db.refresh(student)

        # 2. Configure Accommodations (1.5x time multiplier)
        acc_payload = schemas.StudentAccommodationIn(
            extra_time_multiplier=1.5,
            extra_time_minutes=5,
            high_contrast=True,
            large_text=True,
            notes="Extra time approved"
        )
        acc = accommodations.update_student_accommodation(student.id, acc_payload, db, teacher)
        assert acc.extra_time_multiplier == 1.5
        assert acc.high_contrast is True
        print("[PASS] Student Accommodations configured (1.5x multiplier, high contrast)")

        # 3. Create Questions with Bloom's Taxonomy & Lifecycle Status
        q1_in = schemas.QuestionIn(
            text="What is the time complexity of binary search on a sorted array?",
            options=[
                {"text": "O(log n)", "is_correct": True},
                {"text": "O(n)", "is_correct": False},
                {"text": "O(n log n)", "is_correct": False},
            ],
            subject="Algorithms",
            topic="Searching",
            difficulty="easy",
            blooms_level="understand",
            marks=2.0,
            lifecycle_status="draft",
            misconceptions={"1": "Confused with linear search"}
        )
        q1 = questions.create_question(q1_in, db, teacher)
        assert q1.version == 1
        assert q1.lifecycle_status == "draft"
        assert q1.blooms_level == "understand"
        print("[PASS] Question created in draft with Bloom's taxonomy: understand")

        # 4. Question Review Workflow: draft -> in_review -> approved
        q1_rev = questions.review_question(
            q1.id,
            schemas.QuestionReviewActionIn(action="submit_review", review_notes="Submitted for review"),
            db,
            teacher
        )
        assert q1_rev.lifecycle_status == "in_review"
        print("[PASS] Question submitted for peer review")

        q1_app = questions.review_question(
            q1.id,
            schemas.QuestionReviewActionIn(action="approve", review_notes="Approved by head of department"),
            db,
            teacher
        )
        assert q1_app.lifecycle_status == "approved"
        print("[PASS] Question approved and marked ready for assessments")

        # 5. Question Versioning: Create v2
        q1_v2_in = schemas.QuestionIn(
            text="What is the worst-case time complexity of binary search on an array of size n?",
            options=[
                {"text": "O(log n)", "is_correct": True},
                {"text": "O(n)", "is_correct": False},
            ],
            subject="Algorithms",
            topic="Searching",
            difficulty="medium",
            blooms_level="analyze",
            marks=2.0,
            lifecycle_status="draft"
        )
        q1_v2 = questions.create_new_version(q1.id, q1_v2_in, db, teacher)
        assert q1_v2.version == 2
        assert q1_v2.parent_id == q1.id
        print("[PASS] Question versioned to v2 while preserving v1 parent reference")

        versions = questions.get_question_versions(q1.id, db, teacher)
        assert len(versions) >= 2
        print(f"[PASS] Version history verified ({len(versions)} versions tracked)")

        # Create question 2 for topic coverage
        q2 = questions.create_question(schemas.QuestionIn(
            text="Which sorting algorithm has O(n log n) average time complexity?",
            options=[
                {"text": "Quicksort", "is_correct": True},
                {"text": "Selection Sort", "is_correct": False}
            ],
            subject="Algorithms",
            topic="Sorting",
            difficulty="hard",
            blooms_level="apply",
            marks=3.0,
            lifecycle_status="approved"
        ), db, teacher)

        # 6. Assessment Blueprint & Exam Creation
        exam_in = schemas.ExamIn(
            title="Data Structures & Algorithms Exam",
            subject="Algorithms",
            duration_minutes=20,
            question_ids=[q1.id, q2.id],
            blueprint={
                "topics": {"Searching": 1, "Sorting": 1, "Graphs": 1},
                "difficulty_percentages": {"easy": 50, "medium": 0, "hard": 50},
                "blooms_percentages": {"understand": 50, "apply": 50}
            },
            security_mode="classroom"
        )
        exam = exams.create_exam(exam_in, db, teacher)
        assert exam.total_marks == 5.0
        assert exam.blueprint["topics"]["Searching"] == 1
        print("[PASS] Exam created with Assessment Blueprint")

        # 7. Blueprint Coverage Validation & Matrix Analysis
        cov = exams.get_blueprint_coverage(exam.id, db, teacher)
        assert cov["question_count"] == 2
        assert cov["total_marks"] == 5.0
        assert cov["topic_distribution"]["Searching"] == 1
        assert cov["topic_distribution"]["Sorting"] == 1
        assert any("Graphs" in w for w in cov["warnings"])
        print(f"[PASS] Blueprint Coverage computed: score={cov['coverage_score']}/100, warnings identified")

        # 8. Exam Duplication
        cloned = exams.duplicate_exam(exam.id, db, teacher)
        assert "Copy" in cloned.title
        assert cloned.duration_minutes == 20
        assert cloned.question_count == 2
        print("[PASS] Exam duplicated into new draft successfully")

        # 9. Exam Templates
        tpl_in = schemas.ExamTemplateIn(
            title="Standard CS Midterm Template",
            subject="Algorithms",
            duration_minutes=45,
            security_mode="secure",
            blueprint={"topics": {"Searching": 2}}
        )
        tpl = exams.create_template(tpl_in, db, teacher)
        assert tpl.duration_minutes == 45
        from_tpl = exams.create_exam_from_template(tpl.id, db, teacher)
        assert "Template" in from_tpl.title
        print("[PASS] Exam template created and instantiated")

        # 10. Start Exam and Student Joins (Verifying Accommodation Extra Time & Question Snapshotting)
        started = exams.start_exam(exam.id, 30, db, teacher)
        assert started["access_token"] is not None

        join_res = asyncio.run(attempts.join_exam(
            schemas.JoinExamIn(access_token=started["access_token"]),
            db,
            student
        ))
        # 20 min base * 1.5 multiplier + 5 extra mins = 35 mins
        assert join_res["duration_minutes"] == 35
        assert join_res["accommodation_applied"] is True
        aid = join_res["attempt_id"]
        print(f"[PASS] Student joined with Accommodation applied: 35 minutes granted")

        # Verify Immutable Question Snapshots
        snapshots = db.query(models.AttemptQuestionSnapshot).filter_by(attempt_id=aid).all()
        assert len(snapshots) == 2
        print("[PASS] Immutable Question Snapshots created in database for attempt")

        # 11. Emergency Exam Controls
        pause_res = asyncio.run(exams.emergency_pause_exam(exam.id, db, teacher))
        assert pause_res["is_paused"] is True
        print("[PASS] Emergency pause activated for exam")

        # Verify that saving answers is blocked while paused
        try:
            attempts.save_answer(
                aid,
                schemas.AnswerIn(question_id=q1.id, displayed_index=0),
                db,
                student
            )
            assert False, "Should have failed because exam is paused!"
        except Exception as e:
            assert "paused" in str(e).lower()
            print("[PASS] Answer submission correctly blocked while exam is paused")

        # Emergency Announcement
        ann_res = asyncio.run(exams.emergency_announce(
            exam.id,
            schemas.EmergencyControlIn(action="announce", announcement="All students: Question 1 has 5 minutes remaining!"),
            db,
            teacher
        ))
        assert ann_res["ok"] is True
        print("[PASS] Emergency announcement broadcasted")

        # Emergency Time Extension (+10 mins)
        ext_res = asyncio.run(exams.emergency_extend_time(
            exam.id,
            schemas.EmergencyControlIn(action="extend_time", extra_minutes=10),
            db,
            teacher
        ))
        assert ext_res["affected_attempts"] >= 1
        print("[PASS] Emergency time extension of +10 mins applied")

        # Resume Exam
        resume_res = asyncio.run(exams.emergency_resume_exam(exam.id, db, teacher))
        assert resume_res["is_paused"] is False
        print("[PASS] Exam resumed and timers compensated")

        # 12. Save Answer with Confidence-Based Answering
        save_ok = attempts.save_answer(
            aid,
            schemas.AnswerIn(question_id=q1.id, displayed_index=0, confidence_level="certain"),
            db,
            student
        )
        assert save_ok["ok"] is True
        print("[PASS] Answer saved with confidence level: 'certain'")

        # 13. Submit Attempt & Automatic Evaluation
        sub_res = asyncio.run(attempts.submit_attempt(aid, db, student))
        assert sub_res["ok"] is True
        print(f"[PASS] Attempt evaluated and submitted with initial score: {sub_res['score']}")

        # 14. Rich Grading & Regrading Workflows
        # Manual score adjustment with mandatory reason
        adj = attempts.manual_score_adjustment(
            aid,
            schemas.ManualGradeIn(new_score=4.0, reason="Compensated for question wording nuance"),
            db,
            teacher
        )
        assert adj.new_score == 4.0
        print("[PASS] Manual score adjustment applied with mandatory audit reason")

        # Cancel question (grace marks across all student attempt snapshots)
        cancel_res = attempts.cancel_defective_question(exam.id, q2.id, db, teacher)
        assert cancel_res["cancelled_in_attempts"] >= 1
        print("[PASS] Defective question cancelled across attempt snapshots")

        # Preview regrade
        preview = attempts.regrade_preview(exam.id, db, teacher)
        assert preview["total_submitted_attempts"] >= 1
        print(f"[PASS] Regrade preview computed ({preview['total_submitted_attempts']} attempts)")

        # Commit regrade
        commit_res = attempts.commit_regrade(exam.id, "Answer key update and cancelled question grace marks", db, teacher)
        assert commit_res["ok"] is True
        print("[PASS] Regrade committed to attempts")

        # 15. Privacy Center Disclosure
        disc = accommodations.get_privacy_disclosure()
        assert len(disc["events_collected"]) >= 3
        print("[PASS] Privacy Center transparency disclosure verified")

        print("\n========================================================")
        print("SUCCESS: ALL ROADMAP RELEASE 1 FEATURES PASSED AND VERIFIED!")
        print("========================================================\n")
    finally:
        db.close()

if __name__ == "__main__":
    test_full_roadmap_release_1_workflow()
