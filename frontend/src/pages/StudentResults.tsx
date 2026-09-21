import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";

export default function StudentResults() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["my-analytics"],
    queryFn: async () => (await api.get("/analytics/students/me")).data,
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              Gradebook & Performance Results
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Inspect submitted assessments, review question feedback, and track topic mastery.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="card p-12 text-center text-xs text-[#686760]">Loading your results…</div>
        ) : !stats || stats.attempts === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-xl mb-2">
              📊
            </div>
            <h3 className="font-bold text-sm text-[#1F1F1D]">No submitted exams yet</h3>
            <p className="text-xs text-[#686760] mt-1">
              Your grades, answer keys, and teacher feedback will appear here after submission.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Stat Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-5">
                <span className="text-xs font-semibold text-[#686760]">Completed Exams</span>
                <div className="text-3xl font-extrabold text-[#1F1F1D] mt-1.5">{stats.attempts}</div>
              </div>

              <div className="card p-5">
                <span className="text-xs font-semibold text-[#686760]">Cumulative Average</span>
                <div className="text-3xl font-extrabold text-emerald-800 mt-1.5">
                  {stats.average_pct}%
                </div>
              </div>

              <div className="card p-5">
                <span className="text-xs font-semibold text-[#686760]">Topic Strengths</span>
                <div className="text-xs text-[#686760] mt-2">
                  {stats.weak_topics?.length > 0 ? (
                    <span className="text-amber-800 font-medium">
                      Focus on: {stats.weak_topics.join(", ")}
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium">Consistent mastery across topics</span>
                  )}
                </div>
              </div>
            </div>

            {/* Submissions Table */}
            <div className="card overflow-hidden border border-black/[0.12] shadow-xs">
              <div className="p-4 bg-[#EEECE4] border-b border-black/[0.08] font-bold text-xs uppercase tracking-wider text-[#686760]">
                Submitted Examination Records
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-white border-b border-black/[0.06] text-[#686760] text-[11px] uppercase font-bold">
                    <tr>
                      <th className="p-4">Examination</th>
                      <th className="p-4">Score</th>
                      <th className="p-4">Percentage</th>
                      <th className="p-4">Date Submitted</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06] bg-white/60">
                    {stats.by_exam.map((r: any) => (
                      <tr key={r.exam_id} className="hover:bg-white transition-colors">
                        <td className="p-4 font-bold text-[#1F1F1D]">{r.title}</td>
                        <td className="p-4 font-bold text-[#1F1F1D]">
                          {r.score} <span className="text-[#686760] font-normal">/ {r.total} pts</span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              r.pct >= 70
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : r.pct >= 40
                                ? "bg-amber-100 text-amber-800 border-amber-200"
                                : "bg-rose-100 text-rose-800 border-rose-200"
                            }`}
                          >
                            {r.pct}%
                          </span>
                        </td>
                        <td className="p-4 text-[#686760]">
                          {new Date(r.at).toLocaleString()}
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            to={`/exam/attempt/${r.attempt_id}`}
                            className="px-3 py-1.5 text-xs font-bold bg-[#1F1F1D] text-white hover:bg-black rounded-lg transition shadow-xs inline-block"
                          >
                            Review Feedback →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
