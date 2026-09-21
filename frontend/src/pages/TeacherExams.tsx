import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";

export default function TeacherExams() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [filterTab, setFilterTab] = useState<"all" | "active" | "draft" | "completed">("all");
  const [search, setSearch] = useState("");
  const [startedExam, setStartedExam] = useState<any>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [coverageModal, setCoverageModal] = useState<any>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(false);

  // Queries
  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: async () => (await api.get("/exams")).data,
  });

  // Mutations
  const duplicateExam = useMutation({
    mutationFn: async (id: string) => (await api.post(`/exams/${id}/duplicate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exams"] }),
  });

  const startExam = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/exams/${id}/start?expires_minutes=60`)).data,
    onSuccess: (data, id) => {
      const targetExam = exams.find((e: any) => e.id === id);
      setStartedExam({ ...data, exam_id: id, title: targetExam?.title });
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
  });

  const stopExam = useMutation({
    mutationFn: async (id: string) => (await api.post(`/exams/${id}/stop`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      setStartedExam(null);
    },
  });

  const deleteExam = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/exams/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exams"] }),
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Could not delete exam.");
    },
  });

  const openCoverageMatrix = async (examId: string) => {
    setLoadingCoverage(true);
    try {
      const res = await api.get(`/exams/${examId}/blueprint-coverage`);
      setCoverageModal(res.data);
    } catch (e: any) {
      alert("Failed to load blueprint coverage report: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoadingCoverage(false);
    }
  };

  const filteredExams = useMemo(() => {
    return exams.filter((e: any) => {
      if (filterTab !== "all" && e.status !== filterTab) return false;
      if (search) {
        const s = search.toLowerCase();
        const matchTitle = e.title?.toLowerCase().includes(s);
        const matchSubject = e.subject?.toLowerCase().includes(s);
        if (!matchTitle && !matchSubject) return false;
      }
      return true;
    });
  }, [exams, filterTab, search]);

  const counts = useMemo(() => {
    return {
      all: exams.length,
      active: exams.filter((e: any) => e.status === "active").length,
      draft: exams.filter((e: any) => e.status === "draft").length,
      completed: exams.filter((e: any) => e.status === "completed").length,
    };
  }, [exams]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              Exam Management
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Create, configure, publish, and monitor live examinations.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/teacher/questions"
              className="btn-secondary text-xs sm:text-sm shadow-xs"
            >
              Question Bank
            </Link>
            <Link
              to="/teacher/exams/create"
              className="btn-primary text-xs sm:text-sm shadow-sm flex items-center gap-1.5"
            >
              <span className="text-base leading-none">+</span>
              <span>Create Exam</span>
            </Link>
          </div>
        </div>

        {/* QR Active Session Banner */}
        {startedExam && (
          <div className="card p-6 bg-emerald-50/90 border-emerald-300">
            <div className="flex flex-col md:flex-row items-center gap-6">
              {startedExam.qr_png_base64 && (
                <div className="p-2 bg-white rounded-xl border border-emerald-300 shadow-sm shrink-0">
                  <img
                    src={`data:image/png;base64,${startedExam.qr_png_base64}`}
                    alt="Exam Access QR"
                    className="w-32 h-32"
                  />
                </div>
              )}
              <div className="flex-1 text-center md:text-left">
                <span className="inline-block px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 bg-emerald-200 rounded-full mb-1 uppercase tracking-wider">
                  Active Live Examination
                </span>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <h3 className="text-lg sm:text-xl font-extrabold text-emerald-950">
                    {startedExam.title || "Examination"} • Code:{" "}
                    <span className="font-mono bg-emerald-200/80 px-2 py-0.5 rounded text-emerald-950 font-extrabold tracking-wider">
                      {startedExam.access_token}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(startedExam.access_token);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 transition"
                  >
                    {copiedToken ? "✓ Copied!" : "📋 Copy Code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/exam/join/${startedExam.access_token}`);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 transition"
                  >
                    {copiedLink ? "✓ Link Copied!" : "🔗 Copy Direct Link"}
                  </button>
                </div>
                <p className="text-xs text-emerald-700 mt-1.5">
                  Students join at:{" "}
                  <span className="font-mono font-bold">{window.location.origin}/exam/join/{startedExam.access_token}</span> or enter code on their dashboard.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <Link
                    to={`/teacher/exams/${startedExam.exam_id}/monitor`}
                    className="btn-primary bg-emerald-800 hover:bg-emerald-950 text-xs py-2 px-4 shadow-sm"
                  >
                    Open Live Proctor Monitor →
                  </Link>
                  <button
                    onClick={() => setStartedExam(null)}
                    className="btn-secondary text-xs py-2 px-3.5"
                  >
                    Dismiss Banner
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search & Tabs Filter Bar */}
        <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-black/[0.04] p-1 rounded-full border border-black/5 text-xs w-full md:w-auto overflow-x-auto">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3.5 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
                filterTab === "all" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
              }`}
            >
              All Exams ({counts.all})
            </button>
            <button
              onClick={() => setFilterTab("active")}
              className={`px-3.5 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
                filterTab === "active" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
              }`}
            >
              Active / Live ({counts.active})
            </button>
            <button
              onClick={() => setFilterTab("draft")}
              className={`px-3.5 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
                filterTab === "draft" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
              }`}
            >
              Drafts ({counts.draft})
            </button>
            <button
              onClick={() => setFilterTab("completed")}
              className={`px-3.5 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
                filterTab === "completed" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
              }`}
            >
              Completed ({counts.completed})
            </button>
          </div>

          <div className="relative w-full md:w-72">
            <input
              type="text"
              className="input py-2 pl-9 text-xs sm:text-sm"
              placeholder="Filter by title or subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <svg
              className="w-4 h-4 text-[#686760] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>

        {/* Exams List */}
        {isLoading ? (
          <div className="card p-12 text-center text-[#686760] text-sm">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-[#1F1F1D] border-t-transparent rounded-full mb-2" />
            <p>Loading examinations…</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/5 flex items-center justify-center text-xl text-[#686760] mb-3">
              📋
            </div>
            <h3 className="text-lg font-bold text-[#1F1F1D]">No exams found</h3>
            <p className="text-xs sm:text-sm text-[#686760] mt-1 max-w-md">
              {search || filterTab !== "all"
                ? "No examinations match your current filters. Try switching tabs or clearing your search."
                : "You haven't created any exams yet. Start by creating an exam or adding questions to your bank."}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Link to="/teacher/exams/create" className="btn-primary shadow-sm">
                + Create Exam
              </Link>
              <Link to="/teacher/questions" className="btn-secondary">
                Question Bank
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredExams.map((e: any) => {
              const statusBadge =
                e.status === "active"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : e.status === "completed"
                  ? "bg-slate-100 text-slate-700 border-slate-200"
                  : "bg-amber-100 text-amber-800 border-amber-200";

              return (
                <div
                  key={e.id}
                  className="card p-5 border border-black/10 shadow-xs flex flex-col justify-between hover:border-black/20 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-base sm:text-lg text-[#1F1F1D] leading-snug">
                          {e.title}
                        </h3>
                        <div className="text-xs text-[#686760] mt-0.5 font-medium">
                          {e.subject || "General Subject"}
                        </div>
                      </div>

                      <span className={`badge capitalize text-[11px] font-bold ${statusBadge}`}>
                        {e.status}
                      </span>
                    </div>

                    {e.description && (
                      <p className="text-xs text-[#686760] mt-2 line-clamp-2 leading-relaxed">
                        {e.description}
                      </p>
                    )}

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap items-center gap-2 mt-4 text-xs text-[#686760]">
                      <span className="px-2.5 py-1 rounded-lg bg-black/[0.04] border border-black/5 font-semibold text-[#1F1F1D]">
                        ⏱ {e.duration_minutes} mins
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-black/[0.04] border border-black/5 font-semibold text-[#1F1F1D]">
                        📝 {e.question_count || (e.question_ids ? e.question_ids.length : 0)} questions
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-black/[0.04] border border-black/5 font-semibold text-[#1F1F1D]">
                        ⭐ {e.total_marks || 0} marks
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-black/[0.04] border border-black/5 capitalize">
                        🛡 {e.security_mode}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-5 pt-4 border-t border-black/[0.08] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openCoverageMatrix(e.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-[#686760] hover:text-[#1F1F1D] bg-white hover:bg-black/5 rounded-lg border border-black/10 transition"
                        title="View Assessment Blueprint Alignment"
                      >
                        Blueprint
                      </button>

                      <button
                        onClick={() => duplicateExam.mutate(e.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-[#686760] hover:text-[#1F1F1D] bg-white hover:bg-black/5 rounded-lg border border-black/10 transition"
                        title="Duplicate Exam"
                      >
                        Duplicate
                      </button>

                      {e.status === "draft" && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete draft exam "${e.title}"?`)) {
                              deleteExam.mutate(e.id);
                            }
                          }}
                          className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {e.status === "draft" && (
                        <>
                          <button
                            onClick={() => nav(`/teacher/exams/create?edit=${e.id}`)}
                            className="btn-secondary text-xs py-1.5 px-3"
                          >
                            Edit Draft
                          </button>
                          <button
                            onClick={() => startExam.mutate(e.id)}
                            className="btn-primary text-xs py-1.5 px-3.5 shadow-xs"
                          >
                            Publish & Start →
                          </button>
                        </>
                      )}

                      {e.status === "active" && (
                        <>
                          <Link
                            to={`/teacher/exams/${e.id}/monitor`}
                            className="btn-primary bg-emerald-800 hover:bg-emerald-900 text-xs py-1.5 px-3.5 shadow-xs"
                          >
                            Live Monitor →
                          </Link>
                          <button
                            onClick={() => stopExam.mutate(e.id)}
                            className="btn-secondary text-xs py-1.5 px-3 hover:bg-red-50 hover:text-red-700"
                          >
                            End Exam
                          </button>
                        </>
                      )}

                      {e.status === "completed" && (
                        <Link
                          to="/teacher/results"
                          className="btn-secondary text-xs py-1.5 px-3.5"
                        >
                          View Results →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Blueprint Coverage Modal */}
        {coverageModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl sm:rounded-3xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                <div>
                  <h3 className="font-bold text-base text-[#1F1F1D]">Assessment Blueprint Analysis</h3>
                  <p className="text-xs text-[#686760]">Curriculum and cognitive distribution.</p>
                </div>
                <button
                  onClick={() => setCoverageModal(null)}
                  className="w-7 h-7 rounded-full bg-white text-[#686760] hover:text-black flex items-center justify-center border border-black/10"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-white border border-black/10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#686760] font-bold uppercase tracking-wider">
                    Alignment Score
                  </div>
                  <div className="text-3xl font-black text-[#1F1F1D]">
                    {coverageModal.coverage_score} / 100
                  </div>
                </div>
                <div className="text-xs text-[#686760] text-right space-y-0.5">
                  <div>Questions: <strong>{coverageModal.question_count}</strong></div>
                  <div>Total Marks: <strong>{coverageModal.total_marks} pts</strong></div>
                </div>
              </div>

              {/* Difficulty breakdown */}
              <div className="mt-4">
                <span className="text-xs font-bold text-[#1F1F1D] uppercase tracking-wider block mb-2">
                  Difficulty Distribution
                </span>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200">
                    <span className="block font-semibold">Easy</span>
                    <strong className="text-base font-extrabold">{coverageModal.difficulty_distribution?.easy || 0}%</strong>
                  </div>
                  <div className="p-2.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200">
                    <span className="block font-semibold">Medium</span>
                    <strong className="text-base font-extrabold">{coverageModal.difficulty_distribution?.medium || 0}%</strong>
                  </div>
                  <div className="p-2.5 bg-rose-50 text-rose-800 rounded-xl border border-rose-200">
                    <span className="block font-semibold">Hard</span>
                    <strong className="text-base font-extrabold">{coverageModal.difficulty_distribution?.hard || 0}%</strong>
                  </div>
                </div>
              </div>

              {coverageModal.warnings && coverageModal.warnings.length > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                  <span className="font-bold block">Blueprint Observations:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {coverageModal.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setCoverageModal(null)}
                  className="btn-primary text-xs py-2 px-5"
                >
                  Close Matrix
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
