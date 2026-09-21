import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import QuestionModal from "../components/QuestionModal";
import { api } from "../lib/api";

export default function QuestionBank() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [previewQuestion, setPreviewQuestion] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterBlooms, setFilterBlooms] = useState("");

  // Auto-open modal when navigated from header with ?create=true
  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setModalOpen(true);
      setSearchParams({}, { replace: true }); // Clear param after opening
    }
  }, [searchParams, setSearchParams]);

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["questions", filterSubject, filterDifficulty, filterBlooms, search],
    queryFn: async () => {
      const params: any = {};
      if (filterSubject) params.subject = filterSubject;
      if (filterDifficulty) params.difficulty = filterDifficulty;
      if (filterBlooms) params.blooms_level = filterBlooms;
      if (search) params.search = search;
      const res = await api.get("/questions", { params });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/questions/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Could not delete question.");
    },
  });

  const handleDelete = (q: any) => {
    if (window.confirm(`Are you sure you want to delete this question?\n\n"${q.text.slice(0, 80)}..."`)) {
      deleteMutation.mutate(q.id);
    }
  };

  // Derive unique subjects from question bank for filter
  const allSubjects = Array.from(new Set(questions.map((q: any) => q.subject).filter(Boolean)));

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              Question Bank
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Create, organize, and curate modular questions to assemble comprehensive exams.
            </p>
          </div>
          <div>
            <button
              onClick={() => {
                setEditingQuestion(null);
                setModalOpen(true);
              }}
              className="btn-primary flex items-center gap-2 shadow-sm"
            >
              <span className="text-base leading-none">+</span>
              <span>Create Question</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Controls */}
        <div className="card p-4 flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              className="input pl-9 text-xs sm:text-sm"
              placeholder="Search questions by text, subject, or topic..."
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

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Subject Filter */}
            <select
              className="input py-2 text-xs sm:text-sm w-auto flex-1 md:flex-initial"
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {allSubjects.map((s: any) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Difficulty Filter */}
            <select
              className="input py-2 text-xs sm:text-sm w-auto flex-1 md:flex-initial"
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            {/* Bloom's Taxonomy Filter */}
            <select
              className="input py-2 text-xs sm:text-sm w-auto flex-1 md:flex-initial"
              value={filterBlooms}
              onChange={(e) => setFilterBlooms(e.target.value)}
            >
              <option value="">All Bloom Levels</option>
              <option value="remember">Remember</option>
              <option value="understand">Understand</option>
              <option value="apply">Apply</option>
              <option value="analyze">Analyze</option>
              <option value="evaluate">Evaluate</option>
              <option value="create">Create</option>
            </select>

            {(search || filterSubject || filterDifficulty || filterBlooms) && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterSubject("");
                  setFilterDifficulty("");
                  setFilterBlooms("");
                }}
                className="px-3 py-2 text-xs font-semibold text-[#686760] hover:text-[#1F1F1D] bg-white/60 hover:bg-white rounded-xl border border-black/10 transition"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Question List / Table */}
        {isLoading ? (
          <div className="card p-12 text-center text-[#686760] text-sm">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-[#1F1F1D] border-t-transparent rounded-full mb-2" />
            <p>Loading questions from Question Bank…</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/5 flex items-center justify-center text-xl text-[#686760] mb-3">
              📝
            </div>
            <h3 className="text-lg font-bold text-[#1F1F1D]">Question Bank is empty</h3>
            <p className="text-xs sm:text-sm text-[#686760] mt-1 max-w-md">
              {search || filterSubject || filterDifficulty || filterBlooms
                ? "No questions match the selected search or filter criteria. Try resetting your filters."
                : "Create your first question to start building high-quality, standardized exams."}
            </p>
            <button
              onClick={() => {
                setEditingQuestion(null);
                setModalOpen(true);
              }}
              className="btn-primary mt-5 shadow-sm"
            >
              + Create Question
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden border border-black/[0.12] shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#EEECE4] border-b border-black/[0.08] text-[#686760] uppercase text-[11px] font-bold tracking-wider">
                  <tr>
                    <th className="p-4 font-bold">Question & Topic</th>
                    <th className="p-4 font-bold">Subject</th>
                    <th className="p-4 font-bold">Difficulty</th>
                    <th className="p-4 font-bold">Bloom's Level</th>
                    <th className="p-4 font-bold text-center">Marks</th>
                    <th className="p-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] bg-white/60">
                  {questions.map((q: any) => {
                    const diffColors =
                      q.difficulty === "easy"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : q.difficulty === "hard"
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : "bg-amber-100 text-amber-800 border-amber-200";

                    return (
                      <tr key={q.id} className="hover:bg-white/90 transition-colors">
                        <td className="p-4 max-w-md">
                          <div className="font-semibold text-[#1F1F1D] line-clamp-2 leading-snug">
                            {q.text}
                          </div>
                          <div className="text-xs text-[#686760] mt-1 flex items-center gap-2">
                            <span className="font-medium text-black/70">
                              {q.topic || "General"}
                            </span>
                            <span>•</span>
                            <span>{q.options?.length || 0} options</span>
                            {q.explanation && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-700">✓ Has explanation</span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="p-4 text-[#686760] font-medium">
                          {q.subject || "—"}
                        </td>

                        <td className="p-4">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border capitalize ${diffColors}`}>
                            {q.difficulty || "medium"}
                          </span>
                        </td>

                        <td className="p-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 capitalize">
                            {q.blooms_level || "understand"}
                          </span>
                        </td>

                        <td className="p-4 text-center font-bold text-[#1F1F1D]">
                          {q.marks || 1}
                        </td>

                        <td className="p-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setPreviewQuestion(q)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#1F1F1D] bg-white hover:bg-black/5 rounded-lg border border-black/10 transition"
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => {
                                setEditingQuestion(q);
                                setModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(q)}
                              className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-[#EEECE4]/60 border-t border-black/[0.08] text-xs text-[#686760] flex items-center justify-between px-4">
              <span>Showing <strong>{questions.length}</strong> questions</span>
              <span>Question Bank Version: Production</span>
            </div>
          </div>
        )}

        {/* Modal for Creating / Editing Question */}
        <QuestionModal
          isOpen={modalOpen}
          initialData={editingQuestion}
          onClose={() => {
            setModalOpen(false);
            setEditingQuestion(null);
          }}
          onSaved={() => {
            // Refetch queries
          }}
        />

        {/* Quick Question Preview Modal */}
        {previewQuestion && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#686760] uppercase tracking-wider">
                    Question Preview
                  </span>
                  <span className="badge text-[11px] capitalize">{previewQuestion.difficulty}</span>
                </div>
                <button
                  onClick={() => setPreviewQuestion(null)}
                  className="w-7 h-7 rounded-full bg-white text-[#686760] hover:text-black flex items-center justify-center border border-black/10"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <div className="font-bold text-base text-[#1F1F1D]">
                  {previewQuestion.text}
                </div>

                <div className="space-y-2">
                  {previewQuestion.options?.map((opt: any, i: number) => {
                    const letter = String.fromCharCode(65 + i);
                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center gap-3 ${
                          opt.is_correct
                            ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 font-medium"
                            : "bg-white border-black/10 text-[#1F1F1D]"
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            opt.is_correct
                              ? "bg-emerald-700 text-white"
                              : "bg-black/5 text-[#686760]"
                          }`}
                        >
                          {letter}
                        </span>
                        <span className="flex-1">{opt.text}</span>
                        {opt.is_correct && (
                          <span className="text-xs text-emerald-700 font-bold">✓ Correct</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {previewQuestion.explanation && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900">
                    <span className="font-bold block mb-0.5">Explanation:</span>
                    {previewQuestion.explanation}
                  </div>
                )}

                <div className="pt-2 border-t border-black/[0.08] flex items-center justify-between text-xs text-[#686760]">
                  <div>Subject: <strong>{previewQuestion.subject || "—"}</strong></div>
                  <div>Marks: <strong>{previewQuestion.marks} pts</strong></div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setPreviewQuestion(null)}
                  className="btn-primary text-xs py-2 px-5"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
