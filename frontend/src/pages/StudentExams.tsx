import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";

export default function StudentExams() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"available" | "in_progress" | "completed">("available");
  const [search, setSearch] = useState("");

  const { data: assignedExams = [], isLoading } = useQuery({
    queryKey: ["student-assigned-exams"],
    queryFn: async () => (await api.get("/exams/student/assigned")).data,
  });

  const filteredExams = useMemo(() => {
    return assignedExams.filter((e: any) => {
      if (tab === "available" && (e.attempt_status === "submitted" || e.attempt_status === "in_progress"))
        return false;
      if (tab === "in_progress" && e.attempt_status !== "in_progress") return false;
      if (tab === "completed" && e.attempt_status !== "submitted") return false;

      if (search) {
        const s = search.toLowerCase();
        const matchTitle = e.title?.toLowerCase().includes(s);
        const matchSub = e.subject?.toLowerCase().includes(s);
        if (!matchTitle && !matchSub) return false;
      }
      return true;
    });
  }, [assignedExams, tab, search]);

  const counts = useMemo(() => {
    return {
      available: assignedExams.filter((e: any) => !e.attempt_status).length,
      in_progress: assignedExams.filter((e: any) => e.attempt_status === "in_progress").length,
      completed: assignedExams.filter((e: any) => e.attempt_status === "submitted").length,
    };
  }, [assignedExams]);

  const joinExam = async (exam: any) => {
    try {
      let res;
      if (exam.access_token) {
        res = await api.post("/exams/join", { access_token: exam.access_token });
      } else {
        res = await api.post("/exams/join", { exam_id: exam.id });
      }
      nav(`/exam/attempt/${res.data.attempt_id}`);
    } catch (e: any) {
      alert(e.response?.data?.detail || "Unable to join this exam.");
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              My Assigned Exams
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Browse available tests, continue active sessions, and access completed reviews.
            </p>
          </div>
        </div>

        {/* Filter Controls & Tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-black/5 p-1 rounded-full border border-black/5 text-xs w-full sm:w-auto">
            <button
              onClick={() => setTab("available")}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-full font-bold transition ${
                tab === "available" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
              }`}
            >
              Available ({counts.available})
            </button>
            <button
              onClick={() => setTab("in_progress")}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-full font-bold transition ${
                tab === "in_progress" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
              }`}
            >
              In Progress ({counts.in_progress})
            </button>
            <button
              onClick={() => setTab("completed")}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-full font-bold transition ${
                tab === "completed" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
              }`}
            >
              Completed ({counts.completed})
            </button>
          </div>

          <input
            type="text"
            className="input py-2 text-xs sm:text-sm max-w-xs"
            placeholder="Search exams by title or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Exam Cards Grid */}
        {isLoading ? (
          <div className="card p-12 text-center text-xs text-[#686760]">Loading your exams…</div>
        ) : filteredExams.length === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-xl mb-2">
              📝
            </div>
            <h3 className="font-bold text-sm text-[#1F1F1D]">No {tab} exams found</h3>
            <p className="text-xs text-[#686760] mt-1">
              Check other tabs or ask your instructor if an exam is not appearing.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExams.map((e: any) => (
              <div key={e.id} className="card p-5 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="font-bold text-base text-[#1F1F1D]">{e.title}</h3>
                  <p className="text-xs text-[#686760] mt-1 line-clamp-2">
                    {e.description || "No specific instructions provided."}
                  </p>

                  <div className="text-xs text-[#686760] mt-3 space-y-1">
                    <div>Subject: <strong>{e.subject || "General"}</strong></div>
                    <div className="flex items-center gap-3">
                      <span>⏱ {e.duration_minutes} mins</span>
                      <span>•</span>
                      <span>📝 {e.question_count} items</span>
                      <span>•</span>
                      <span>🎯 {e.total_marks} pts</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-black/[0.08] flex items-center justify-between">
                  {e.attempt_status === "submitted" ? (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-emerald-800">
                        Score: {e.score} pts
                      </span>
                      <Link
                        to={`/exam/attempt/${e.attempt_id}`}
                        className="text-xs font-bold text-[#1F1F1D] hover:underline"
                      >
                        Review Answers →
                      </Link>
                    </div>
                  ) : e.attempt_status === "in_progress" ? (
                    <button
                      onClick={() => nav(`/exam/attempt/${e.attempt_id}`)}
                      className="btn-primary text-xs py-2 w-full bg-amber-800 hover:bg-amber-900"
                    >
                      Resume Attempt →
                    </button>
                  ) : (
                    <button
                      onClick={() => joinExam(e)}
                      className="btn-primary text-xs py-2 w-full"
                    >
                      Start Examination →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
