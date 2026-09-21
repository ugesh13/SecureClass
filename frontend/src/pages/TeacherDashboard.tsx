import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import QuestionModal from "../components/QuestionModal";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [questionModalOpen, setQuestionModalOpen] = useState(false);

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms"],
    queryFn: async () => (await api.get("/classrooms")).data,
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["exams"],
    queryFn: async () => (await api.get("/exams")).data,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["questions"],
    queryFn: async () => (await api.get("/questions")).data,
  });

  const deleteExam = useMutation({
    mutationFn: async ({ id, force = false }: { id: string; force?: boolean }) =>
      (await api.delete(`/exams/${id}${force ? "?force=true" : ""}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exams"] }),
    onError: (err: any, variables) => {
      const detail = err.response?.data?.detail || "";
      if (detail.includes("student attempt") && !variables.force) {
        if (window.confirm(`${detail}\n\nDo you want to permanently FORCE DELETE this exam and remove all test attempts?`)) {
          deleteExam.mutate({ id: variables.id, force: true });
          return;
        }
      }
      alert(detail || "Could not delete exam.");
    },
  });

  const activeExams = exams.filter((e: any) => e.status === "active");
  const draftExams = exams.filter((e: any) => e.status === "draft");
  const completedExams = exams.filter((e: any) => e.status === "completed");

  // Calculate total students across classrooms
  const totalStudents = classrooms.reduce((sum: number, c: any) => sum + (c.member_count || 0), 0);

  // Greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <Layout>
      <div className="space-y-8">
        {/* Welcome Banner */}
        <div className="card p-6 sm:p-8 bg-gradient-to-br from-[#1F1F1D] to-[#2d2d2a] text-[#F3F1E9] rounded-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#DE6B48]/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="relative">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-white/15 text-[#F3F1E9]/90 border border-white/10">
              Teacher Portal
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3">
              {greeting}, {user?.full_name?.split(" ")[0] || "Teacher"} 👋
            </h1>
            <p className="text-sm text-[#F3F1E9]/70 mt-1 max-w-xl">
              Manage your modular Question Bank, construct assessments, and proctor live exams.
            </p>

            {/* Prominent Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 mt-5">
              <button
                onClick={() => setQuestionModalOpen(true)}
                className="px-4 py-2.5 rounded-full font-bold text-xs sm:text-sm bg-white/15 border border-white/20 text-white hover:bg-white/25 transition shadow-xs flex items-center gap-1.5 backdrop-blur-sm"
              >
                <span className="text-base leading-none text-emerald-400">+</span>
                <span>Create Question</span>
              </button>

              <Link
                to="/teacher/exams/create"
                className="px-4 py-2.5 rounded-full font-bold text-xs sm:text-sm bg-[#DE6B48] text-white hover:bg-[#c45a3c] transition shadow-sm flex items-center gap-1.5"
              >
                <span className="text-base leading-none">+</span>
                <span>Create Exam</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 4 Core Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/teacher/questions"
            className="card p-5 hover:bg-white transition group border border-black/10"
          >
            <div className="flex items-center justify-between text-xs text-[#686760]">
              <span className="font-semibold">Question Bank</span>
              <span className="text-lg">📚</span>
            </div>
            <div className="text-3xl font-extrabold text-[#1F1F1D] mt-2 group-hover:text-black">
              {questions.length}
            </div>
            <div className="text-[11px] text-[#686760] mt-1">Available questions</div>
          </Link>

          <Link
            to="/teacher/exams"
            className="card p-5 hover:bg-white transition group border border-black/10"
          >
            <div className="flex items-center justify-between text-xs text-[#686760]">
              <span className="font-semibold">Active Live Exams</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-3xl font-extrabold text-[#1F1F1D] mt-2">
              {activeExams.length}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium mt-1">In progress & live</div>
          </Link>

          <Link
            to="/teacher/exams"
            className="card p-5 hover:bg-white transition group border border-black/10"
          >
            <div className="flex items-center justify-between text-xs text-[#686760]">
              <span className="font-semibold">Draft Exams</span>
              <span className="text-lg">📝</span>
            </div>
            <div className="text-3xl font-extrabold text-[#1F1F1D] mt-2">
              {draftExams.length}
            </div>
            <div className="text-[11px] text-[#686760] mt-1">Ready for publishing</div>
          </Link>

          <Link
            to="/teacher/settings"
            className="card p-5 hover:bg-white transition group border border-black/10"
          >
            <div className="flex items-center justify-between text-xs text-[#686760]">
              <span className="font-semibold">Classrooms</span>
              <span className="text-lg">🏫</span>
            </div>
            <div className="text-3xl font-extrabold text-[#1F1F1D] mt-2">
              {classrooms.length}
            </div>
            <div className="text-[11px] text-[#686760] mt-1">{totalStudents} total students</div>
          </Link>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <div className="text-2xl font-extrabold text-[#1F1F1D]">{exams.length}</div>
            <div className="text-[11px] text-[#686760] font-medium mt-0.5">Total Exams Created</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-extrabold text-emerald-700">{completedExams.length}</div>
            <div className="text-[11px] text-[#686760] font-medium mt-0.5">Completed Sessions</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-extrabold text-[#1F1F1D]">{totalStudents}</div>
            <div className="text-[11px] text-[#686760] font-medium mt-0.5">Enrolled Students</div>
          </div>
        </div>

        {/* Workflow Guide Banner */}
        <div className="card p-5 sm:p-6 bg-gradient-to-r from-amber-50/70 to-orange-50/70 border-amber-200/80">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-amber-200/70 text-amber-900 border border-amber-300">
                Recommended Workflow
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-[#1F1F1D] mt-1.5">
                Standard Teacher Examination Pipeline
              </h3>
              <p className="text-xs text-[#686760] mt-1 max-w-2xl">
                1. <strong>Question Bank</strong> (Create & curate items) → 2. <strong>Create Exam</strong> (Select pool & configure duration) → 3. <strong>Blueprint & Security</strong> → 4. <strong>Review & Preview</strong> → 5. <strong>Publish & Monitor</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setQuestionModalOpen(true)}
                className="btn-secondary text-xs py-2 px-3.5"
              >
                + Add Questions
              </button>
              <Link to="/teacher/exams/create" className="btn-primary text-xs py-2 px-4 shadow-xs">
                Build Exam →
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content Grid: Recent Exams & Classrooms */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Recent Exams (2 cols) */}
          <div className="md:col-span-2 card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
              <div>
                <h2 className="font-bold text-base text-[#1F1F1D]">Recent Examinations</h2>
                <p className="text-xs text-[#686760]">Your latest configured and published exams.</p>
              </div>
              <Link
                to="/teacher/exams"
                className="text-xs font-bold text-[#1F1F1D] hover:underline"
              >
                View All ({exams.length}) →
              </Link>
            </div>

            {exams.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-xl text-[#686760] mb-2">
                  📝
                </div>
                <h4 className="font-bold text-sm text-[#1F1F1D]">No exams created yet</h4>
                <p className="text-xs text-[#686760] mt-1 max-w-xs">
                  Create questions in your bank or build a new examination directly.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setQuestionModalOpen(true)}
                    className="btn-secondary text-xs"
                  >
                    + Create Question
                  </button>
                  <Link to="/teacher/exams/create" className="btn-primary text-xs">
                    + Create Exam
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.06]">
                {exams.slice(0, 5).map((e: any) => {
                  const statusColor =
                    e.status === "active"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                      : e.status === "draft"
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-slate-100 text-slate-800 border-slate-200";

                  return (
                    <div
                      key={e.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#1F1F1D]">{e.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${statusColor}`}>
                            {e.status}
                          </span>
                        </div>
                        <div className="text-xs text-[#686760] mt-1 flex items-center gap-2">
                          <span>{e.subject || "General"}</span>
                          <span>•</span>
                          <span>{e.question_count || 0} questions</span>
                          <span>•</span>
                          <span>{e.duration_minutes} mins</span>
                          <span>•</span>
                          <span>{e.total_marks || 0} pts</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {e.status === "active" && (
                          <Link
                            to={`/teacher/exams/${e.id}/monitor`}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition"
                          >
                            Live Proctor →
                          </Link>
                        )}
                        {e.status === "draft" && (
                          <Link
                            to={`/teacher/exams/create?edit=${e.id}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-black/10 hover:bg-black/5 text-[#1F1F1D] transition"
                          >
                            Edit Draft
                          </Link>
                        )}
                        <Link
                          to="/teacher/results"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#686760] hover:text-[#1F1F1D] hover:bg-black/5 transition"
                        >
                          Results
                        </Link>
                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete exam "${e.title}"? This cannot be undone.`)) {
                              deleteExam.mutate({ id: e.id, force: false });
                            }
                          }}
                          className="p-1.5 rounded-lg text-[#686760] hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title="Delete exam"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Classrooms Sidebar (1 col) */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
              <div>
                <h2 className="font-bold text-base text-[#1F1F1D]">Classrooms</h2>
                <p className="text-xs text-[#686760]">Enrolled student groups.</p>
              </div>
              <Link
                to="/teacher/settings"
                className="text-xs font-bold text-[#1F1F1D] hover:underline"
              >
                Manage →
              </Link>
            </div>

            {classrooms.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#686760]">
                <p>No classrooms configured yet.</p>
                <Link
                  to="/teacher/settings"
                  className="btn-secondary text-xs mt-3 inline-block"
                >
                  + Add Classroom
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {classrooms.slice(0, 5).map((c: any) => (
                  <div
                    key={c.id}
                    className="p-3 bg-white/70 rounded-xl border border-black/10 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-[#1F1F1D]">{c.name}</div>
                      <div className="text-[11px] text-[#686760]">
                        {c.subject || "General"} {c.section ? `• Sec ${c.section}` : ""}
                      </div>
                    </div>
                    <span className="badge text-[11px] font-bold">
                      {c.member_count} students
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inline Modal for Rapid Question Creation */}
        <QuestionModal
          isOpen={questionModalOpen}
          onClose={() => setQuestionModalOpen(false)}
          onSaved={() => {
            // query auto invalidated
          }}
        />
      </div>
    </Layout>
  );
}
