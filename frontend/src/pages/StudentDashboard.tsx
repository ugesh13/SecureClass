import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";

export default function StudentDashboard() {
  const nav = useNavigate();
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 1. Assigned Available Exams
  const { data: assignedExams = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ["student-assigned-exams"],
    queryFn: async () => (await api.get("/exams/student/assigned")).data,
  });

  // 2. Student Analytics & History
  const { data: stats } = useQuery({
    queryKey: ["my-analytics"],
    queryFn: async () => (await api.get("/analytics/students/me")).data,
  });

  const joinWithToken = async (customToken?: string) => {
    const tok = (customToken || token).trim();
    if (!tok) return;
    setErr("");
    setBusy(true);
    try {
      const { data } = await api.post("/exams/join", { access_token: tok });
      nav(`/exam/attempt/${data.attempt_id}`);
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Unable to join exam. Please check your access code.");
    } finally {
      setBusy(false);
    }
  };

  const joinWithExamId = async (examId: string) => {
    setErr("");
    setBusy(true);
    try {
      const { data } = await api.post("/exams/join", { exam_id: examId });
      nav(`/exam/attempt/${data.attempt_id}`);
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Unable to join exam. Please check with your teacher.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              Student Assessment Center
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Join active examination sessions, take tests, and review performance reports.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/student/exams"
              className="btn-secondary text-xs sm:text-sm"
            >
              My Exams
            </Link>
            <Link
              to="/student/results"
              className="btn-secondary text-xs sm:text-sm"
            >
              Results & Grades
            </Link>
          </div>
        </div>

        {/* Quick Join Access Banner */}
        <div className="card p-6 sm:p-7 bg-gradient-to-r from-amber-50/80 to-orange-50/80 border-amber-200 shadow-sm">
          <div className="max-w-xl">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
              Exam Access
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#1F1F1D] mt-2">
              Join Examination with Access Token
            </h2>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Enter the unique session access code provided by your teacher or test proctor.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2 mt-4">
              <input
                type="text"
                className="input text-sm uppercase tracking-wider font-mono font-bold flex-1"
                placeholder="Enter Access Token (e.g. A9F482)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") joinWithToken();
                }}
              />
              <button
                onClick={() => joinWithToken()}
                disabled={!token.trim() || busy}
                className="btn-primary text-xs sm:text-sm px-6 py-2.5 w-full sm:w-auto shadow-sm disabled:opacity-40"
              >
                {busy ? "Connecting…" : "Join Exam →"}
              </button>
            </div>

            {err && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {err}
              </div>
            )}
          </div>
        </div>

        {/* Available Assigned Exams */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#1F1F1D]">
              Assigned & Available Exams ({assignedExams.length})
            </h2>
            <Link to="/student/exams" className="text-xs font-bold text-[#1F1F1D] hover:underline">
              View All →
            </Link>
          </div>

          {loadingAssigned ? (
            <div className="card p-8 text-center text-xs text-[#686760]">
              Loading assigned exams…
            </div>
          ) : assignedExams.length === 0 ? (
            <div className="card p-8 text-center flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-xl mb-2">
                🎓
              </div>
              <h3 className="font-bold text-sm text-[#1F1F1D]">No active exams right now</h3>
              <p className="text-xs text-[#686760] mt-1 max-w-sm">
                Exams published by your teachers or open enrollment assessments will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignedExams.map((e: any) => {
                const isOngoing = e.attempt_status === "in_progress";
                const isSubmitted = e.attempt_status === "submitted";

                return (
                  <div key={e.id} className="card p-5 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-base text-[#1F1F1D]">{e.title}</h3>
                        <span
                          className={`badge text-[10px] font-bold uppercase tracking-wider ${
                            isOngoing
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : isSubmitted
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : "bg-blue-50 text-blue-800 border-blue-200"
                          }`}
                        >
                          {isOngoing ? "In Progress" : isSubmitted ? "Submitted" : "Available"}
                        </span>
                      </div>

                      <div className="text-xs text-[#686760] mt-2 space-y-1">
                        <div>Subject: <strong>{e.subject || "General"}</strong></div>
                        <div className="flex items-center gap-3">
                          <span>⏱ {e.duration_minutes} mins</span>
                          <span>•</span>
                          <span>📝 {e.question_count} questions</span>
                          <span>•</span>
                          <span>🎯 {e.total_marks} pts</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-black/[0.08] flex items-center justify-between">
                      {isSubmitted ? (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-emerald-800">
                            Score: {e.score} pts
                          </span>
                          <Link
                            to={`/exam/attempt/${e.attempt_id}`}
                            className="text-xs font-bold text-[#1F1F1D] hover:underline"
                          >
                            Review Feedback →
                          </Link>
                        </div>
                      ) : isOngoing ? (
                        <button
                          onClick={() => nav(`/exam/attempt/${e.attempt_id}`)}
                          className="btn-primary text-xs py-2 w-full bg-amber-800 hover:bg-amber-900"
                        >
                          Resume Exam →
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (e.access_token) {
                              joinWithToken(e.access_token);
                            } else {
                              joinWithExamId(e.id);
                            }
                          }}
                          className="btn-primary text-xs py-2 w-full"
                        >
                          Start Exam →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Performance & Topic Analytics */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Performance Overview */}
          <div className="card p-6 space-y-4">
            <h3 className="font-bold text-base text-[#1F1F1D]">Overall Performance</h3>
            {!stats || stats.attempts === 0 ? (
              <p className="text-xs text-[#686760]">
                No completed exams yet. Take your first test to see detailed scoring analytics.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-baseline gap-3">
                  <div className="text-4xl font-extrabold text-[#1F1F1D]">
                    {stats.average_pct}%
                  </div>
                  <span className="text-xs text-[#686760]">
                    Average score across {stats.attempts} completed exam(s)
                  </span>
                </div>

                {stats.weak_topics?.length > 0 && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                    <span className="font-bold text-amber-900 block mb-1">
                      Recommended Review Topics:
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {stats.weak_topics.map((t: string) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-full bg-white border border-amber-300 text-amber-800 font-medium"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent Submissions */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
              <h3 className="font-bold text-base text-[#1F1F1D]">Recent Scores</h3>
              <Link to="/student/results" className="text-xs font-bold text-[#1F1F1D] hover:underline">
                View All Results →
              </Link>
            </div>

            {stats?.by_exam?.length > 0 ? (
              <div className="divide-y divide-black/[0.06] text-xs">
                {stats.by_exam.slice(0, 4).map((r: any) => (
                  <div key={r.exam_id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#1F1F1D] block">{r.title}</span>
                      <span className="text-[11px] text-[#686760]">
                        {new Date(r.at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <strong className="text-sm font-extrabold text-[#1F1F1D]">
                        {r.score} / {r.total}
                      </strong>
                      <span className="text-[11px] text-emerald-700 block font-semibold">
                        {r.pct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#686760]">No past score records found.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
