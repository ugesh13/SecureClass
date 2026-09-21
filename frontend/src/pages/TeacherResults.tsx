import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { api } from "../lib/api";

export default function TeacherResults() {
  const qc = useQueryClient();
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [manualGradeModal, setManualGradeModal] = useState<any>(null);
  const [newScore, setNewScore] = useState<number>(0);
  const [gradeReason, setGradeReason] = useState<string>("");
  const [regradePreviewData, setRegradePreviewData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // 1. Fetch Teacher Exams
  const { data: exams = [], isLoading: loadingExams } = useQuery({
    queryKey: ["exams"],
    queryFn: async () => (await api.get("/exams")).data,
  });

  // Default select first exam if none selected
  const activeExamId = selectedExamId || exams[0]?.id;
  const currentExam = exams.find((e: any) => e.id === activeExamId);

  // 2. Fetch Exam Analytics
  const { data: analytics, isLoading: loadingAnalytics } = useQuery({
    queryKey: ["exam-analytics", activeExamId],
    queryFn: async () => {
      if (!activeExamId) return null;
      try {
        return (await api.get(`/analytics/exams/${activeExamId}`)).data;
      } catch {
        return null;
      }
    },
    enabled: Boolean(activeExamId),
  });

  // 3. Fetch Exam Full Details (Submissions & Questions)
  const { data: examDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["exam-details-results", activeExamId],
    queryFn: async () => {
      if (!activeExamId) return null;
      return (await api.get(`/exams/${activeExamId}/details`)).data;
    },
    enabled: Boolean(activeExamId),
  });

  // 4. Regrade Mutations
  const regradePreviewMutation = useMutation({
    mutationFn: async () => (await api.post(`/exams/${activeExamId}/regrade-preview`)).data,
    onSuccess: (data) => setRegradePreviewData(data),
    onError: (err: any) => setErrorMsg(err.response?.data?.detail || "Failed to preview regrade."),
  });

  const commitRegradeMutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/exams/${activeExamId}/regrade?reason=Key correction and score moderation`)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["exam-analytics", activeExamId] });
      setRegradePreviewData(null);
      alert(`Regrade complete: updated ${data.regraded_attempts} student attempts.`);
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.detail || "Failed to commit regrade."),
  });

  // 5. Manual Grade Mutation
  const manualGradeMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`/attempts/${manualGradeModal.id}/manual-grade`, {
          new_score: Number(newScore),
          reason: gradeReason.trim(),
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-analytics", activeExamId] });
      setManualGradeModal(null);
      setGradeReason("");
      alert("Manual grade adjustment logged successfully.");
    },
    onError: (err: any) =>
      setErrorMsg(err.response?.data?.detail || "Failed to adjust student score. Reason is required."),
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              Assessment Results & Analytics
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Review student scores, inspect topic performance, adjust grades, and execute regrades.
            </p>
          </div>

          {/* Exam Selector */}
          {exams.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#686760] whitespace-nowrap">Exam:</span>
              <select
                className="input py-2 text-xs sm:text-sm font-semibold w-auto max-w-xs"
                value={activeExamId || ""}
                onChange={(e) => setSelectedExamId(e.target.value)}
              >
                {exams.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} className="font-bold text-red-800">
              ✕
            </button>
          </div>
        )}

        {loadingExams ? (
          <div className="card p-12 text-center text-sm text-[#686760]">
            Loading examinations…
          </div>
        ) : exams.length === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-xl mb-2">
              📊
            </div>
            <h3 className="font-bold text-base text-[#1F1F1D]">No examinations found</h3>
            <p className="text-xs text-[#686760] mt-1 max-w-sm">
              You need to create and publish exams before viewing student results.
            </p>
          </div>
        ) : (
          <>
            {/* Exam Overview Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="card p-5">
                <span className="text-xs text-[#686760] font-semibold">Submissions</span>
                <div className="text-3xl font-extrabold text-[#1F1F1D] mt-1.5">
                  {analytics?.submitted ?? 0}
                  <span className="text-xs font-normal text-[#686760] ml-1.5">
                    / {analytics?.attempts ?? 0} started
                  </span>
                </div>
              </div>

              <div className="card p-5">
                <span className="text-xs text-[#686760] font-semibold">Average Score</span>
                <div className="text-3xl font-extrabold text-[#1F1F1D] mt-1.5">
                  {analytics?.average ?? 0}
                  <span className="text-xs font-normal text-[#686760] ml-1.5">
                    / {currentExam?.total_marks ?? 0} pts
                  </span>
                </div>
              </div>

              <div className="card p-5">
                <span className="text-xs text-[#686760] font-semibold">Pass Rate (≥40%)</span>
                <div className="text-3xl font-extrabold text-emerald-800 mt-1.5">
                  {analytics?.pass_rate ?? 0}%
                </div>
              </div>

              <div className="card p-5">
                <span className="text-xs text-[#686760] font-semibold">High / Low Score</span>
                <div className="text-2xl font-extrabold text-[#1F1F1D] mt-2">
                  <span className="text-emerald-700">{analytics?.highest ?? 0}</span>
                  <span className="text-[#686760] text-sm font-normal mx-1">/</span>
                  <span className="text-rose-700">{analytics?.lowest ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Topic Performance Breakdown */}
            {analytics?.topic_performance && Object.keys(analytics.topic_performance).length > 0 && (
              <div className="card p-6 space-y-3">
                <h3 className="text-sm font-bold text-[#1F1F1D] uppercase tracking-wider">
                  Topic Mastery & Performance Breakdown
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(analytics.topic_performance).map(([topic, pct]: [string, any]) => (
                    <div key={topic} className="p-3 bg-white rounded-xl border border-black/10 text-xs">
                      <div className="flex items-center justify-between font-bold text-[#1F1F1D] mb-1">
                        <span>{topic}</span>
                        <span className={pct >= 60 ? "text-emerald-700" : "text-amber-700"}>
                          {pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 70 ? "bg-emerald-600" : pct >= 40 ? "bg-amber-500" : "bg-rose-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regrade and Moderation Controls */}
            <div className="card p-5 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-sm text-blue-950">Automated Regrade Engine</h4>
                <p className="text-xs text-blue-800 mt-0.5 max-w-xl">
                  If answer keys were corrected or grace marks added, recalculate all student submissions with 1-click immutable audit logging.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => regradePreviewMutation.mutate()}
                  disabled={regradePreviewMutation.isPending}
                  className="btn-secondary text-xs py-2 px-3.5"
                >
                  {regradePreviewMutation.isPending ? "Calculating…" : "Preview Regrade Impact"}
                </button>
              </div>
            </div>

            {/* Regrade Preview Modal */}
            {regradePreviewData && (
              <div className="card p-5 border-blue-300 bg-white space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#1F1F1D]">Regrade Impact Preview</h4>
                  <button
                    onClick={() => setRegradePreviewData(null)}
                    className="text-xs text-[#686760] hover:text-black"
                  >
                    ✕ Close
                  </button>
                </div>
                <p className="text-xs text-[#686760]">
                  Found <strong>{regradePreviewData.diffs?.length || 0}</strong> submitted attempts to evaluate.
                </p>
                <div className="max-h-48 overflow-y-auto divide-y divide-black/[0.06] text-xs">
                  {regradePreviewData.diffs?.map((d: any) => (
                    <div key={d.attempt_id} className="py-2 flex items-center justify-between">
                      <span className="font-mono text-[#686760]">Attempt: {d.attempt_id.slice(0, 8)}...</span>
                      <div>
                        <span>Current: {d.current_score}</span> →{" "}
                        <strong className="text-emerald-700">New: {d.recalculated_score}</strong>{" "}
                        ({d.diff >= 0 ? `+${d.diff}` : d.diff})
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.08]">
                  <button
                    onClick={() => setRegradePreviewData(null)}
                    className="btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => commitRegradeMutation.mutate()}
                    disabled={commitRegradeMutation.isPending}
                    className="btn-primary text-xs bg-emerald-700 hover:bg-emerald-800"
                  >
                    {commitRegradeMutation.isPending ? "Applying…" : "Commit & Recalculate Grades"}
                  </button>
                </div>
              </div>
            )}

            {/* Questions Roster Preview */}
            <div className="card p-6 space-y-3">
              <h3 className="text-sm font-bold text-[#1F1F1D] uppercase tracking-wider">
                Exam Questions ({examDetails?.questions?.length || 0})
              </h3>
              <div className="divide-y divide-black/[0.06]">
                {examDetails?.questions?.map((q: any, i: number) => (
                  <div key={q.id} className="py-3 text-xs flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="font-bold text-[#1F1F1D]">
                        Q{i + 1}. {q.text}
                      </span>
                      <div className="text-[#686760] flex items-center gap-2">
                        <span>{q.topic || "General"}</span>
                        <span>•</span>
                        <span className="capitalize">{q.difficulty}</span>
                        <span>•</span>
                        <span>{q.marks} pts</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Manual Grade Adjustment Modal */}
        {manualGradeModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                <h3 className="font-bold text-sm text-[#1F1F1D]">Adjust Student Score</h3>
                <button
                  onClick={() => setManualGradeModal(null)}
                  className="w-6 h-6 rounded-full bg-white text-xs text-[#686760]"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">New Score (pts)</label>
                <input
                  type="number"
                  step="0.5"
                  className="input"
                  value={newScore}
                  onChange={(e) => setNewScore(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                  Mandatory Audit Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="input resize-y min-h-[70px] text-xs"
                  placeholder="e.g. Granted grace mark for ambiguous question wording in Q3."
                  value={gradeReason}
                  onChange={(e) => setGradeReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.08]">
                <button
                  onClick={() => setManualGradeModal(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => manualGradeMutation.mutate()}
                  disabled={!gradeReason.trim() || manualGradeMutation.isPending}
                  className="btn-primary text-xs"
                >
                  {manualGradeMutation.isPending ? "Saving…" : "Save Adjustment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
