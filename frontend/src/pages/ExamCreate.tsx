import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Layout from "../components/Layout";
import QuestionModal from "../components/QuestionModal";
import { api } from "../lib/api";

export default function ExamCreate() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const editExamId = searchParams.get("edit");

  // Step state (1: Details, 2: Questions, 3: Blueprint, 4: Security, 5: Review)
  const [currentStep, setCurrentStep] = useState(1);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [studentPreviewOpen, setStudentPreviewOpen] = useState(false);
  const [qSearch, setQSearch] = useState("");
  const [qSubjectFilter, setQSubjectFilter] = useState("");
  const [showAdvancedBlueprint, setShowAdvancedBlueprint] = useState(false);
  const [publishedData, setPublishedData] = useState<any>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form State
  const [form, setForm] = useState<any>({
    title: "",
    subject: "",
    description: "",
    duration_minutes: 60,
    classroom_id: "",
    enrollment_type: "open", // open | classroom | private
    question_ids: [] as string[],
    blueprint: {
      topics: {},
      difficulty_percentages: { easy: 30, medium: 50, hard: 20 },
      blooms_percentages: { remember: 20, understand: 30, apply: 30, analyze: 20 },
    },
    security_mode: "classroom", // practice | classroom | secure
    randomize_questions: true,
    randomize_options: true,
    negative_marking: false,
    require_approval: false,
    status: "draft",
  });

  // Queries
  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms"],
    queryFn: async () => (await api.get("/classrooms")).data,
  });

  const { data: questions = [], isLoading: loadingQuestions } = useQuery({
    queryKey: ["questions"],
    queryFn: async () => (await api.get("/questions")).data,
  });

  // Preload exam if editing an existing draft
  useQuery({
    queryKey: ["exam-edit", editExamId],
    queryFn: async () => {
      if (!editExamId) return null;
      const res = await api.get(`/exams/${editExamId}/details`);
      const e = res.data.exam;
      setForm({
        title: e.title || "",
        subject: e.subject || "",
        description: e.description || "",
        duration_minutes: e.duration_minutes || 60,
        classroom_id: e.classroom_id || "",
        enrollment_type: e.classroom_id ? "classroom" : "open",
        question_ids: e.question_ids || [],
        blueprint: e.blueprint || {
          topics: {},
          difficulty_percentages: { easy: 30, medium: 50, hard: 20 },
          blooms_percentages: { remember: 20, understand: 30, apply: 30, analyze: 20 },
        },
        security_mode: e.security_mode || "classroom",
        randomize_questions: e.randomize_questions ?? true,
        randomize_options: e.randomize_options ?? true,
        negative_marking: e.negative_marking ?? false,
        require_approval: e.require_approval ?? false,
        status: e.status || "draft",
      });
      return res.data;
    },
    enabled: Boolean(editExamId),
  });

  // ——— Autosave: persist form to localStorage on change (debounced) ———
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const AUTOSAVE_KEY = "sc_exam_draft_autosave";
  const hasUnsavedRef = useRef(false);

  // Restore from autosave on mount (only for new exams, not editing)
  useEffect(() => {
    if (editExamId) return; // Don't restore if editing an existing exam
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.title || parsed.question_ids?.length > 0) {
          const shouldRestore = window.confirm(
            `You have an unsaved exam draft ("${parsed.title || 'Untitled'}"). Would you like to restore it?`
          );
          if (shouldRestore) {
            setForm(parsed);
          } else {
            localStorage.removeItem(AUTOSAVE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(AUTOSAVE_KEY);
      }
    }
  }, [editExamId]);

  // Debounced save to localStorage on form changes
  useEffect(() => {
    if (editExamId) return; // Only autosave new exam creation
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (form.title || form.question_ids?.length > 0) {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(form));
        hasUnsavedRef.current = true;
      }
    }, 2000);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [form, editExamId]);

  // beforeunload warning for unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedRef.current && !editExamId) {
        // Save immediately before unload
        if (form.title || form.question_ids?.length > 0) {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(form));
        }
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form, editExamId]);

  // Selected questions objects & auto calculation of marks
  const selectedQuestions = useMemo(() => {
    return questions.filter((q: any) => form.question_ids.includes(q.id));
  }, [questions, form.question_ids]);

  const totalCalculatedMarks = useMemo(() => {
    return selectedQuestions.reduce((acc: number, q: any) => acc + (q.marks || 1), 0);
  }, [selectedQuestions]);

  // Difficulty counts for blueprint
  const selectedDifficultyDistribution = useMemo(() => {
    const total = selectedQuestions.length;
    if (total === 0) return { easy: 0, medium: 0, hard: 0 };
    const easy = selectedQuestions.filter((q: any) => q.difficulty === "easy").length;
    const med = selectedQuestions.filter((q: any) => q.difficulty === "medium" || !q.difficulty).length;
    const hard = selectedQuestions.filter((q: any) => q.difficulty === "hard").length;
    return {
      easy: Math.round((easy / total) * 100),
      medium: Math.round((med / total) * 100),
      hard: Math.round((hard / total) * 100),
    };
  }, [selectedQuestions]);

  // Mutations
  const saveExamMutation = useMutation({
    mutationFn: async ({ status }: { status: "draft" | "active" }) => {
      const payload = {
        ...form,
        classroom_id: form.enrollment_type === "classroom" ? form.classroom_id : null,
        status,
      };
      if (editExamId) {
        return (await api.put(`/exams/${editExamId}`, payload)).data;
      } else {
        return (await api.post("/exams", payload)).data;
      }
    },
    onSuccess: async (data, { status }) => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      if (status === "active") {
        // Automatically start the exam to generate session & QR code
        try {
          const started = await api.post(`/exams/${data.id}/start?expires_minutes=${data.duration_minutes || 60}`);
          setPublishedData({ ...started.data, exam_id: data.id, title: data.title });
        } catch (e: any) {
          nav("/teacher/exams");
        }
      } else {
        nav("/teacher/exams");
      }
      // Clear autosave on successful save
      localStorage.removeItem(AUTOSAVE_KEY);
      hasUnsavedRef.current = false;
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to save exam. Please check all details.");
    },
  });

  const handleToggleQuestion = (id: string) => {
    setForm((prev: any) => ({
      ...prev,
      question_ids: prev.question_ids.includes(id)
        ? prev.question_ids.filter((x: string) => x !== id)
        : [...prev.question_ids, id],
    }));
  };

  const handleSelectAllFiltered = (filteredList: any[]) => {
    const idsToAdd = filteredList.map((q) => q.id);
    setForm((prev: any) => {
      const set = new Set([...prev.question_ids, ...idsToAdd]);
      return { ...prev, question_ids: Array.from(set) };
    });
  };

  const handleDeselectAll = () => {
    setForm((prev: any) => ({ ...prev, question_ids: [] }));
  };

  // Filtered Question Bank list
  const filteredQuestions = useMemo(() => {
    return questions.filter((q: any) => {
      if (qSubjectFilter && q.subject !== qSubjectFilter) return false;
      if (qSearch) {
        const s = qSearch.toLowerCase();
        const textMatch = q.text?.toLowerCase().includes(s);
        const topicMatch = q.topic?.toLowerCase().includes(s);
        const subjectMatch = q.subject?.toLowerCase().includes(s);
        if (!textMatch && !topicMatch && !subjectMatch) return false;
      }
      return true;
    });
  }, [questions, qSearch, qSubjectFilter]);

  const uniqueSubjects = Array.from(new Set(questions.map((q: any) => q.subject).filter(Boolean)));

  const STEPS = [
    { num: 1, label: "Basic Details" },
    { num: 2, label: "Select Questions" },
    { num: 3, label: "Assessment Blueprint" },
    { num: 4, label: "Exam Security" },
    { num: 5, label: "Review & Publish" },
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Breadcrumb & Step Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#686760] mb-1">
              <Link to="/teacher/exams" className="hover:underline">
                Exams
              </Link>
              <span>/</span>
              <span className="text-[#1F1F1D] font-bold">
                {editExamId ? "Edit Exam Draft" : "Create Exam"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              {editExamId ? "Edit Exam Configuration" : "Create New Exam"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => saveExamMutation.mutate({ status: "draft" })}
              disabled={!form.title.trim() || saveExamMutation.isPending}
              className="btn-secondary text-xs"
              title="Save draft and return later"
            >
              Save Draft
            </button>
          </div>
        </div>

        {/* Step Progress Tracker */}
        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between gap-1 overflow-x-auto">
            {STEPS.map((s) => {
              const isCurrent = currentStep === s.num;
              const isPast = currentStep > s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => setCurrentStep(s.num)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                    isCurrent
                      ? "bg-[#1F1F1D] text-[#F3F1E9]"
                      : isPast
                      ? "text-[#1F1F1D] bg-black/5 hover:bg-black/10"
                      : "text-[#8E8C82] hover:text-[#1F1F1D]"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      isCurrent
                        ? "bg-white/20 text-white"
                        : isPast
                        ? "bg-[#1F1F1D] text-white"
                        : "bg-black/10 text-[#686760]"
                    }`}
                  >
                    {isPast ? "✓" : s.num}
                  </span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===================== STEP 1: BASIC DETAILS ===================== */}
        {currentStep === 1 && (
          <div className="card p-6 sm:p-8 space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-bold text-[#1F1F1D]">Step 1 — Basic Details</h2>
              <p className="text-xs text-[#686760] mt-0.5">
                Set up the core title, subject matter, duration, and enrollment audience.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                  Exam Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input text-base font-semibold"
                  placeholder="e.g. Mid-Semester Database Systems Quiz"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                    Subject / Course
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Database Management Systems"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                    Exam Duration (Minutes) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="360"
                    className="input"
                    value={form.duration_minutes}
                    onChange={(e) =>
                      setForm({ ...form, duration_minutes: parseInt(e.target.value) || 30 })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                  Description / Student Instructions (Optional)
                </label>
                <textarea
                  className="input resize-y min-h-[80px]"
                  placeholder="Instructions for students (e.g. Please read each question carefully. No external reference materials allowed)."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {/* Enrollment Settings - Friendly Card Selection */}
              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-2">
                  Student Enrollment Audience
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Option 1: Open Enrollment */}
                  <label
                    className={`card p-4 cursor-pointer transition border ${
                      form.enrollment_type === "open"
                        ? "border-[#1F1F1D] bg-white ring-1 ring-[#1F1F1D]"
                        : "border-black/10 hover:bg-white/80"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="enrollment"
                        checked={form.enrollment_type === "open"}
                        onChange={() => setForm({ ...form, enrollment_type: "open", classroom_id: "" })}
                      />
                      <span className="font-bold text-xs sm:text-sm text-[#1F1F1D]">Open Enrollment</span>
                    </div>
                    <p className="text-xs text-[#686760] mt-1.5 leading-relaxed">
                      Anyone with the exam access link or QR code can join immediately.
                    </p>
                  </label>

                  {/* Option 2: Assigned Class */}
                  <label
                    className={`card p-4 cursor-pointer transition border ${
                      form.enrollment_type === "classroom"
                        ? "border-[#1F1F1D] bg-white ring-1 ring-[#1F1F1D]"
                        : "border-black/10 hover:bg-white/80"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="enrollment"
                        checked={form.enrollment_type === "classroom"}
                        onChange={() => setForm({ ...form, enrollment_type: "classroom" })}
                      />
                      <span className="font-bold text-xs sm:text-sm text-[#1F1F1D]">Assigned Classroom</span>
                    </div>
                    <p className="text-xs text-[#686760] mt-1.5 leading-relaxed">
                      Only students officially enrolled in the designated class roster can access.
                    </p>
                  </label>

                  {/* Option 3: Private / Invite */}
                  <label
                    className={`card p-4 cursor-pointer transition border ${
                      form.enrollment_type === "private"
                        ? "border-[#1F1F1D] bg-white ring-1 ring-[#1F1F1D]"
                        : "border-black/10 hover:bg-white/80"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="enrollment"
                        checked={form.enrollment_type === "private"}
                        onChange={() => setForm({ ...form, enrollment_type: "private", classroom_id: "" })}
                      />
                      <span className="font-bold text-xs sm:text-sm text-[#1F1F1D]">Private Access</span>
                    </div>
                    <p className="text-xs text-[#686760] mt-1.5 leading-relaxed">
                      Students require teacher proctor approval before their exam unlocks.
                    </p>
                  </label>
                </div>

                {/* Conditional Classroom Dropdown if Assigned Class selected */}
                {form.enrollment_type === "classroom" && (
                  <div className="mt-3 p-4 bg-white/80 rounded-xl border border-black/10">
                    <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                      Select Classroom Roster
                    </label>
                    <select
                      className="input"
                      value={form.classroom_id}
                      onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}
                    >
                      <option value="">— Choose Classroom —</option>
                      {classrooms.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.subject || "General"}) • {c.member_count} students
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-black/[0.08] flex justify-end">
              <button
                type="button"
                disabled={!form.title.trim()}
                onClick={() => setCurrentStep(2)}
                className="btn-primary shadow-sm disabled:opacity-40"
              >
                Continue to Questions →
              </button>
            </div>
          </div>
        )}

        {/* ===================== STEP 2: SELECT QUESTIONS ===================== */}
        {currentStep === 2 && (
          <div className="card p-6 sm:p-8 space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#1F1F1D]">Step 2 — Select Questions</h2>
                <p className="text-xs text-[#686760] mt-0.5">
                  Select questions from your Question Bank or create new questions on the fly.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuestionModalOpen(true)}
                  className="btn-primary flex items-center gap-1.5 text-xs py-2 px-4 shadow-sm"
                >
                  <span className="text-base leading-none">+</span>
                  <span>Create Question</span>
                </button>
              </div>
            </div>

            {/* Running Selection Counter Banner */}
            <div className="p-3.5 rounded-xl bg-[#EEECE4] border border-black/[0.08] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[#686760]">Selected: </span>
                  <strong className="text-sm font-extrabold text-[#1F1F1D]">
                    {form.question_ids.length} questions
                  </strong>
                </div>
                <div>
                  <span className="text-[#686760]">Total Marks: </span>
                  <strong className="text-sm font-extrabold text-[#1F1F1D]">
                    {totalCalculatedMarks} pts
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectAllFiltered(filteredQuestions)}
                  className="text-xs text-[#1F1F1D] font-semibold hover:underline"
                >
                  Select All Filtered
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs text-[#686760] hover:underline"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            {/* Question Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                className="input py-2 text-xs flex-1"
                placeholder="Search questions by text or topic..."
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
              />
              <select
                className="input py-2 text-xs w-auto"
                value={qSubjectFilter}
                onChange={(e) => setQSubjectFilter(e.target.value)}
              >
                <option value="">All Subjects</option>
                {uniqueSubjects.map((s: any) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Questions List or Empty State */}
            {loadingQuestions ? (
              <div className="p-8 text-center text-xs text-[#686760]">
                Loading question bank…
              </div>
            ) : questions.length === 0 ? (
              /* REQUIRED EMPTY STATE */
              <div className="p-8 rounded-2xl bg-white/70 border border-black/10 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-xl text-[#686760] mb-2">
                  📚
                </div>
                <h3 className="font-bold text-sm sm:text-base text-[#1F1F1D]">
                  No questions in your Question Bank yet.
                </h3>
                <p className="text-xs text-[#686760] mt-1 max-w-sm">
                  Create your first question now to include it in this exam, or manage your full bank.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestionModalOpen(true)}
                    className="btn-primary text-xs py-2 px-4 shadow-sm"
                  >
                    + Create Question
                  </button>
                  <Link
                    to="/teacher/questions"
                    target="_blank"
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Open Question Bank ↗
                  </Link>
                </div>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#686760]">
                No questions match your current search.
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {filteredQuestions.map((q: any) => {
                  const isChecked = form.question_ids.includes(q.id);
                  const diffColor =
                    q.difficulty === "easy"
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : q.difficulty === "hard"
                      ? "text-rose-700 bg-rose-50 border-rose-200"
                      : "text-amber-700 bg-amber-50 border-amber-200";

                  return (
                    <label
                      key={q.id}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                        isChecked
                          ? "bg-white border-[#1F1F1D] shadow-xs"
                          : "bg-white/60 border-black/10 hover:bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleQuestion(q.id)}
                        className="mt-1 rounded accent-[#1F1F1D] cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs sm:text-sm text-[#1F1F1D]">
                          {q.text}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-[#686760]">
                          <span className="font-medium">{q.topic || "General"}</span>
                          <span>•</span>
                          <span className={`px-2 py-0.5 rounded-full border font-semibold capitalize ${diffColor}`}>
                            {q.difficulty || "medium"}
                          </span>
                          <span>•</span>
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 capitalize">
                            {q.blooms_level || "understand"}
                          </span>
                          <span>•</span>
                          <strong className="text-[#1F1F1D]">{q.marks || 1} pt{q.marks !== 1 ? "s" : ""}</strong>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="pt-4 border-t border-black/[0.08] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="btn-secondary text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="btn-primary shadow-sm"
              >
                Continue to Blueprint →
              </button>
            </div>
          </div>
        )}

        {/* ===================== STEP 3: ASSESSMENT BLUEPRINT (OPTIONAL) ===================== */}
        {currentStep === 3 && (
          <div className="card p-6 sm:p-8 space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1F1F1D]">
                  Step 3 — Assessment Blueprint (Optional)
                </h2>
                <p className="text-xs text-[#686760] mt-0.5">
                  Configure cognitive taxonomy and difficulty balancing. This step is optional and will not block publishing.
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-[#1F1F1D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAdvancedBlueprint}
                  onChange={(e) => setShowAdvancedBlueprint(e.target.checked)}
                  className="rounded accent-[#1F1F1D]"
                />
                <span>Enable Blueprint Validation</span>
              </label>
            </div>

            {/* Current Selected Breakdown Overview */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs">
                <span className="block font-bold text-emerald-900">Easy Questions</span>
                <span className="text-xl font-extrabold text-emerald-800">
                  {selectedDifficultyDistribution.easy}%
                </span>
              </div>
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs">
                <span className="block font-bold text-amber-900">Medium Questions</span>
                <span className="text-xl font-extrabold text-amber-800">
                  {selectedDifficultyDistribution.medium}%
                </span>
              </div>
              <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl text-xs">
                <span className="block font-bold text-rose-900">Hard Questions</span>
                <span className="text-xl font-extrabold text-rose-800">
                  {selectedDifficultyDistribution.hard}%
                </span>
              </div>
            </div>

            {showAdvancedBlueprint ? (
              <div className="p-4 rounded-xl bg-white border border-black/10 space-y-4 text-xs">
                <div className="font-bold text-[#1F1F1D]">Target Difficulty Percentages (%):</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#686760] mb-1">Target Easy %</label>
                    <input
                      type="number"
                      className="input py-1.5 text-xs"
                      value={form.blueprint.difficulty_percentages.easy}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          blueprint: {
                            ...form.blueprint,
                            difficulty_percentages: {
                              ...form.blueprint.difficulty_percentages,
                              easy: parseInt(e.target.value) || 0,
                            },
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#686760] mb-1">Target Medium %</label>
                    <input
                      type="number"
                      className="input py-1.5 text-xs"
                      value={form.blueprint.difficulty_percentages.medium}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          blueprint: {
                            ...form.blueprint,
                            difficulty_percentages: {
                              ...form.blueprint.difficulty_percentages,
                              medium: parseInt(e.target.value) || 0,
                            },
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#686760] mb-1">Target Hard %</label>
                    <input
                      type="number"
                      className="input py-1.5 text-xs"
                      value={form.blueprint.difficulty_percentages.hard}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          blueprint: {
                            ...form.blueprint,
                            difficulty_percentages: {
                              ...form.blueprint.difficulty_percentages,
                              hard: parseInt(e.target.value) || 0,
                            },
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#EEECE4]/60 text-xs text-[#686760]">
                Standard balanced blueprint will be used automatically (30% Easy, 50% Medium, 20% Hard). You can proceed to Security Settings.
              </div>
            )}

            <div className="pt-4 border-t border-black/[0.08] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="btn-secondary text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="btn-primary shadow-sm"
              >
                Continue to Security →
              </button>
            </div>
          </div>
        )}

        {/* ===================== STEP 4: EXAM SECURITY ===================== */}
        {currentStep === 4 && (
          <div className="card p-6 sm:p-8 space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-bold text-[#1F1F1D]">Step 4 — Exam Security</h2>
              <p className="text-xs text-[#686760] mt-0.5">
                Choose the appropriate monitoring and security safeguards for this assessment.
              </p>
            </div>

            {/* Security Level Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Standard */}
              <label
                className={`card p-4 cursor-pointer transition border ${
                  form.security_mode === "practice"
                    ? "border-[#1F1F1D] bg-white ring-1 ring-[#1F1F1D]"
                    : "border-black/10 hover:bg-white/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="security_mode"
                    checked={form.security_mode === "practice"}
                    onChange={() => setForm({ ...form, security_mode: "practice" })}
                  />
                  <span className="font-bold text-xs sm:text-sm text-[#1F1F1D]">Standard</span>
                </div>
                <p className="text-xs text-[#686760] mt-1.5 leading-relaxed">
                  Basic exam protection. Open browser practice mode with timer and response capture.
                </p>
              </label>

              {/* Secure */}
              <label
                className={`card p-4 cursor-pointer transition border ${
                  form.security_mode === "classroom"
                    ? "border-[#1F1F1D] bg-white ring-1 ring-[#1F1F1D]"
                    : "border-black/10 hover:bg-white/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="security_mode"
                    checked={form.security_mode === "classroom"}
                    onChange={() => setForm({ ...form, security_mode: "classroom" })}
                  />
                  <span className="font-bold text-xs sm:text-sm text-[#1F1F1D]">Secure</span>
                </div>
                <p className="text-xs text-[#686760] mt-1.5 leading-relaxed">
                  Browser tab-switch monitoring, focus tracking, and live classroom telemetries.
                </p>
              </label>

              {/* High Security */}
              <label
                className={`card p-4 cursor-pointer transition border ${
                  form.security_mode === "secure"
                    ? "border-[#1F1F1D] bg-white ring-1 ring-[#1F1F1D]"
                    : "border-black/10 hover:bg-white/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="security_mode"
                    checked={form.security_mode === "secure"}
                    onChange={() => setForm({ ...form, security_mode: "secure" })}
                  />
                  <span className="font-bold text-xs sm:text-sm text-[#1F1F1D]">High Security</span>
                </div>
                <p className="text-xs text-[#686760] mt-1.5 leading-relaxed">
                  Strict exam integrity: full proctor approval, full-screen lock enforcement, and audit logs.
                </p>
              </label>
            </div>

            {/* Additional Integrity Toggles */}
            <div className="p-4 rounded-xl bg-white/70 border border-black/10 space-y-3">
              <div className="font-bold text-xs text-[#1F1F1D]">Integrity Options:</div>

              <label className="flex items-center gap-2 text-xs font-medium text-[#1F1F1D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.randomize_questions}
                  onChange={(e) => setForm({ ...form, randomize_questions: e.target.checked })}
                  className="rounded accent-[#1F1F1D]"
                />
                <span>Randomize question order for each student</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-[#1F1F1D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.randomize_options}
                  onChange={(e) => setForm({ ...form, randomize_options: e.target.checked })}
                  className="rounded accent-[#1F1F1D]"
                />
                <span>Shuffle multiple choice option order (A, B, C, D)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-[#1F1F1D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.negative_marking}
                  onChange={(e) => setForm({ ...form, negative_marking: e.target.checked })}
                  className="rounded accent-[#1F1F1D]"
                />
                <span>Enable negative marking for incorrect answers</span>
              </label>
            </div>

            <div className="pt-4 border-t border-black/[0.08] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="btn-secondary text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="btn-primary shadow-sm"
              >
                Review Exam →
              </button>
            </div>
          </div>
        )}

        {/* ===================== STEP 5: REVIEW & PUBLISH ===================== */}
        {currentStep === 5 && (
          <div className="card p-6 sm:p-8 space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.08] pb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1F1F1D]">Step 5 — Review & Launch</h2>
                <p className="text-xs text-[#686760] mt-0.5">
                  Verify the exam configuration, test the student preview, and publish.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStudentPreviewOpen(true)}
                className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-4 shadow-xs"
              >
                <span>👁</span>
                <span>Preview as Student</span>
              </button>
            </div>

            {/* Validation Warning if no questions */}
            {form.question_ids.length === 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
                ⚠️ You have not selected any questions yet. An exam must have at least 1 question to be published.
                You can still <strong>Save Draft</strong> or go back to Step 2.
              </div>
            )}

            {/* Summary Review Card */}
            <div className="p-5 rounded-2xl bg-white/90 border border-black/10 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-black/[0.06]">
                <div>
                  <span className="text-xs font-bold text-[#686760] uppercase tracking-wider block">
                    Exam Title
                  </span>
                  <div className="text-base font-extrabold text-[#1F1F1D] mt-0.5">
                    {form.title || "Untitled Exam"}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-[#686760] uppercase tracking-wider block">
                    Subject
                  </span>
                  <div className="font-semibold text-[#1F1F1D] mt-0.5">
                    {form.subject || "General"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-black/[0.06]">
                <div>
                  <span className="text-xs text-[#686760] block">Duration</span>
                  <strong className="text-sm text-[#1F1F1D]">{form.duration_minutes} mins</strong>
                </div>
                <div>
                  <span className="text-xs text-[#686760] block">Questions</span>
                  <strong className="text-sm text-[#1F1F1D]">{form.question_ids.length} items</strong>
                </div>
                <div>
                  <span className="text-xs text-[#686760] block">Total Marks</span>
                  <strong className="text-sm text-[#1F1F1D]">{totalCalculatedMarks} pts</strong>
                </div>
                <div>
                  <span className="text-xs text-[#686760] block">Security</span>
                  <strong className="text-sm text-[#1F1F1D] capitalize">{form.security_mode}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-[#686760] block">Enrollment Type</span>
                  <strong className="text-sm text-[#1F1F1D] capitalize">
                    {form.enrollment_type === "classroom" ? "Assigned Classroom Roster" : form.enrollment_type === "open" ? "Open Enrollment" : "Private Access"}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-[#686760] block">Difficulty Balance</span>
                  <span className="text-xs font-semibold text-[#1F1F1D]">
                    {selectedDifficultyDistribution.easy}% Easy • {selectedDifficultyDistribution.medium}% Med • {selectedDifficultyDistribution.hard}% Hard
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Final Action Buttons */}
            <div className="pt-4 border-t border-black/[0.08] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="btn-secondary text-xs"
              >
                ← Back to Security
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={saveExamMutation.isPending}
                  onClick={() => saveExamMutation.mutate({ status: "draft" })}
                  className="btn-secondary text-xs px-5"
                >
                  Save as Draft
                </button>

                <button
                  type="button"
                  disabled={form.question_ids.length === 0 || !form.title.trim() || saveExamMutation.isPending}
                  onClick={() => saveExamMutation.mutate({ status: "active" })}
                  className="btn-primary text-xs sm:text-sm px-6 shadow-sm disabled:opacity-40"
                >
                  {saveExamMutation.isPending ? "Publishing…" : "Publish & Activate Exam →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Inline Question Creator */}
        <QuestionModal
          isOpen={questionModalOpen}
          defaultSubject={form.subject}
          onClose={() => setQuestionModalOpen(false)}
          onSaved={(newQ, createAnother) => {
            // Automatically select this newly created question into the current exam
            setForm((prev: any) => ({
              ...prev,
              question_ids: [...new Set([...prev.question_ids, newQ.id])],
            }));
            if (!createAnother) {
              setQuestionModalOpen(false);
            }
          }}
        />

        {/* Modal: Student Experience Preview */}
        {studentPreviewOpen && (
          <StudentPreviewModal
            examTitle={form.title}
            durationMinutes={form.duration_minutes}
            questions={selectedQuestions}
            onClose={() => setStudentPreviewOpen(false)}
          />
        )}

        {/* Modal: Live Active Exam Started with QR Code */}
        {publishedData && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-3xl max-w-md w-full p-6 sm:p-8 text-center shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto text-xl mb-3">
                ✓
              </div>
              <h3 className="text-xl font-extrabold text-[#1F1F1D]">Exam Published & Live!</h3>
              <p className="text-xs text-[#686760] mt-1">
                Students can now scan the QR code or enter the access token to begin.
              </p>

              {publishedData.qr_png_base64 && (
                <div className="mt-4 p-3 bg-white rounded-2xl border border-black/10 inline-block shadow-sm">
                  <img
                    src={`data:image/png;base64,${publishedData.qr_png_base64}`}
                    alt="Exam Access QR Code"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
              )}

              <div className="mt-4 p-3 rounded-xl bg-white border border-black/10 text-xs">
                <span className="text-[#686760] block mb-0.5">Student Access Token:</span>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="font-mono text-xl font-extrabold text-[#1F1F1D] tracking-widest bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
                    {publishedData.access_token}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(publishedData.access_token);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-black/10 bg-white hover:bg-black/5 transition"
                    title="Copy Access Code"
                  >
                    {copiedToken ? "✓ Copied!" : "📋 Copy Code"}
                  </button>
                </div>
                <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between text-[11px] text-[#686760]">
                  <span className="truncate max-w-[220px]">
                    {window.location.origin}/exam/join/{publishedData.access_token}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/exam/join/${publishedData.access_token}`);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="font-bold text-[#1F1F1D] hover:underline shrink-0 ml-2"
                  >
                    {copiedLink ? "✓ Link Copied" : "Copy Link"}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Link
                  to={`/teacher/exams/${publishedData.exam_id}/monitor`}
                  className="btn-primary text-xs py-3 w-full"
                >
                  Open Live Proctor Monitor →
                </Link>
                <Link
                  to="/teacher/exams"
                  className="btn-secondary text-xs py-2.5 w-full text-center"
                >
                  Return to Exams List
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

/**
 * Interactive Student Testing Simulator (Preview as Student)
 * Renders the exact student exam take environment without writing to the database.
 */
function StudentPreviewModal({
  examTitle,
  durationMinutes,
  questions,
  onClose,
}: {
  examTitle: string;
  durationMinutes: number;
  questions: any[];
  onClose: () => void;
}) {
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const currentQ = questions[currentQIndex];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in overflow-y-auto">
      <div className="bg-[#F8F7F2] border border-black/20 rounded-2xl sm:rounded-3xl shadow-2xl max-w-3xl w-full p-4 sm:p-6 my-auto max-h-[92vh] flex flex-col">
        {/* Simulator Banner */}
        <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
              Student Experience Preview
            </span>
            <span className="text-xs text-[#686760] hidden sm:inline">
              (No actual student attempt records will be created)
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white text-[#686760] hover:text-black flex items-center justify-center border border-black/10"
          >
            ✕
          </button>
        </div>

        {/* Student Exam Header */}
        <div className="py-3 flex items-center justify-between border-b border-black/[0.06] text-xs">
          <div>
            <h3 className="font-bold text-sm text-[#1F1F1D]">{examTitle || "Untitled Exam"}</h3>
            <span className="text-[#686760]">
              Question {questions.length > 0 ? currentQIndex + 1 : 0} of {questions.length}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 border border-black/5 font-mono font-bold text-xs text-[#1F1F1D]">
            <span>⏱</span>
            <span>{durationMinutes}:00</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {questions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#686760]">
              No questions have been added to this exam yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="font-bold text-sm sm:text-base text-[#1F1F1D] leading-relaxed">
                {currentQ?.text}
              </div>

              <div className="space-y-2">
                {currentQ?.options?.map((opt: any, idx: number) => {
                  const letter = String.fromCharCode(65 + idx);
                  const isSelected = answers[currentQIndex] === idx;
                  return (
                    <label
                      key={idx}
                      onClick={() => setAnswers({ ...answers, [currentQIndex]: idx })}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border text-xs sm:text-sm cursor-pointer transition ${
                        isSelected
                          ? "bg-white border-[#1F1F1D] ring-1 ring-[#1F1F1D]"
                          : "bg-white/60 border-black/10 hover:bg-white"
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSelected
                            ? "bg-[#1F1F1D] text-white"
                            : "bg-black/5 text-[#686760]"
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="flex-1 font-medium text-[#1F1F1D]">{opt.text}</span>
                    </label>
                  );
                })}
              </div>

              {/* Quick Jump Question Palette */}
              <div className="pt-4 border-t border-black/[0.08]">
                <span className="text-[11px] font-bold text-[#686760] uppercase tracking-wider block mb-2">
                  Question Palette:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {questions.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentQIndex(i)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                        i === currentQIndex
                          ? "bg-[#1F1F1D] text-white"
                          : answers[i] !== undefined
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : "bg-white border border-black/15 text-[#686760]"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav Bar */}
        <div className="pt-3 border-t border-black/[0.08] flex items-center justify-between">
          <button
            type="button"
            disabled={currentQIndex === 0}
            onClick={() => setCurrentQIndex(currentQIndex - 1)}
            className="btn-secondary text-xs disabled:opacity-30"
          >
            ← Previous Question
          </button>

          {currentQIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentQIndex(currentQIndex + 1)}
              className="btn-primary text-xs px-4"
            >
              Next Question →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => alert("Simulation: In the real student exam, this submits the attempt and locks questions.")}
              className="btn-primary text-xs px-5 bg-emerald-700 hover:bg-emerald-800"
            >
              Simulate Submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
