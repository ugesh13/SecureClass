import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (question: any, createAnother?: boolean) => void;
  initialData?: any;
  defaultSubject?: string;
  defaultTopic?: string;
}

export default function QuestionModal({
  isOpen,
  onClose,
  onSaved,
  initialData,
  defaultSubject = "",
  defaultTopic = "",
}: QuestionModalProps) {
  const qc = useQueryClient();
  const isEditing = Boolean(initialData?.id);

  const defaultForm = {
    text: "",
    qType: "mcq", // mcq | true_false | short_answer
    subject: defaultSubject,
    topic: defaultTopic,
    difficulty: "medium",
    blooms_level: "understand",
    marks: 1.0,
    negative_marks: 0.0,
    explanation: "",
    options: [
      { text: "", is_correct: true },
      { text: "", is_correct: false },
      { text: "", is_correct: false },
      { text: "", is_correct: false },
    ],
  };

  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialData) {
      setForm({
        text: initialData.text || "",
        qType: initialData.options?.length === 2 && (initialData.options[0].text === "True" || initialData.options[0].text === "False") ? "true_false" : "mcq",
        subject: initialData.subject || defaultSubject,
        topic: initialData.topic || defaultTopic,
        difficulty: initialData.difficulty || "medium",
        blooms_level: initialData.blooms_level || "understand",
        marks: initialData.marks || 1.0,
        negative_marks: initialData.negative_marks || 0.0,
        explanation: initialData.explanation || "",
        options: initialData.options?.length >= 2 ? initialData.options : defaultForm.options,
      });
    } else {
      setForm({
        ...defaultForm,
        subject: defaultSubject,
        topic: defaultTopic,
      });
    }
    setError("");
  }, [initialData, isOpen, defaultSubject, defaultTopic]);

  const saveMutation = useMutation({
    mutationFn: async ({ payload, createAnother }: { payload: any; createAnother?: boolean }) => {
      let res;
      if (isEditing) {
        res = await api.put(`/questions/${initialData.id}`, payload);
      } else {
        res = await api.post("/questions", payload);
      }
      return { data: res.data, createAnother };
    },
    onSuccess: ({ data, createAnother }) => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      onSaved(data, createAnother);
      if (createAnother) {
        setForm({
          ...defaultForm,
          subject: form.subject,
          topic: form.topic,
          difficulty: form.difficulty,
          blooms_level: form.blooms_level,
          marks: form.marks,
        });
        setError("");
      } else {
        onClose();
      }
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "Failed to save question. Please check all required fields.");
    },
  });

  if (!isOpen) return null;

  const handleTypeChange = (type: string) => {
    if (type === "true_false") {
      setForm({
        ...form,
        qType: "true_false",
        options: [
          { text: "True", is_correct: true },
          { text: "False", is_correct: false },
        ],
      });
    } else if (type === "mcq") {
      setForm({
        ...form,
        qType: "mcq",
        options: [
          { text: "", is_correct: true },
          { text: "", is_correct: false },
          { text: "", is_correct: false },
          { text: "", is_correct: false },
        ],
      });
    } else {
      // short answer
      setForm({
        ...form,
        qType: "short_answer",
        options: [
          { text: "Correct Answer Key", is_correct: true },
          { text: "Alternative Acceptable Key", is_correct: false },
        ],
      });
    }
  };

  const handleSubmit = (createAnother: boolean) => {
    setError("");
    if (!form.text.trim()) {
      setError("Please enter the question text.");
      return;
    }

    if (form.qType === "mcq") {
      const validOptions = form.options.filter((o) => o.text.trim() !== "");
      if (validOptions.length < 2) {
        setError("Please provide at least 2 non-empty options for multiple choice.");
        return;
      }
      const hasCorrect = validOptions.some((o) => o.is_correct);
      if (!hasCorrect) {
        setError("Please mark one option as the correct answer.");
        return;
      }
    }

    const payload = {
      text: form.text.trim(),
      options: form.options,
      subject: form.subject.trim() || null,
      topic: form.topic.trim() || null,
      difficulty: form.difficulty,
      blooms_level: form.blooms_level,
      marks: Number(form.marks) || 1.0,
      negative_marks: Number(form.negative_marks) || 0.0,
      explanation: form.explanation.trim() || null,
      lifecycle_status: "published",
    };

    saveMutation.mutate({ payload, createAnother });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in overflow-y-auto">
      <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl md:rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-[#1F1F1D]">
              {isEditing ? "Edit Question" : "Create New Question"}
            </h2>
            <p className="text-xs text-[#686760] mt-0.5">
              Add multiple choice or objective items to your Question Bank.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#686760] hover:text-[#1F1F1D] flex items-center justify-center border border-black/10 transition"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* Question Type Selection */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#686760] uppercase tracking-wider">Type:</span>
            <div className="flex bg-black/[0.05] p-1 rounded-full border border-black/5 text-xs">
              <button
                type="button"
                onClick={() => handleTypeChange("mcq")}
                className={`px-3 py-1 rounded-full font-semibold transition ${
                  form.qType === "mcq" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
                }`}
              >
                Multiple Choice
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("true_false")}
                className={`px-3 py-1 rounded-full font-semibold transition ${
                  form.qType === "true_false" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
                }`}
              >
                True / False
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("short_answer")}
                className={`px-3 py-1 rounded-full font-semibold transition ${
                  form.qType === "short_answer" ? "bg-white text-[#1F1F1D] shadow-xs" : "text-[#686760]"
                }`}
              >
                Short Answer
              </button>
            </div>
          </div>

          {/* Question Text */}
          <div>
            <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
              Question Prompt <span className="text-red-500">*</span>
            </label>
            <textarea
              className="input resize-y min-h-[90px]"
              placeholder="e.g. What is the primary purpose of indexing in relational databases?"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1F1F1D]">
                Answer Options (select the radio button next to the correct answer):
              </label>
              {form.qType === "mcq" && form.options.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      options: [...form.options, { text: "", is_correct: false }],
                    })
                  }
                  className="text-xs text-blue-700 hover:underline font-semibold"
                >
                  + Add Option
                </button>
              )}
            </div>

            <div className="space-y-2">
              {form.options.map((opt, idx) => {
                const labelLetter = String.fromCharCode(65 + idx);
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    <label
                      className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border cursor-pointer transition ${
                        opt.is_correct
                          ? "bg-[#1F1F1D] text-[#F3F1E9] border-[#1F1F1D]"
                          : "bg-white text-[#686760] border-black/15 hover:bg-black/5"
                      }`}
                      title="Click to mark as correct answer"
                    >
                      <input
                        type="radio"
                        name="correct-option"
                        className="sr-only"
                        checked={opt.is_correct}
                        onChange={() => {
                          const updated = form.options.map((o, i) => ({
                            ...o,
                            is_correct: i === idx,
                          }));
                          setForm({ ...form, options: updated });
                        }}
                      />
                      {labelLetter}
                    </label>

                    <input
                      className="input flex-1 py-2 text-xs sm:text-sm"
                      placeholder={`Option ${labelLetter}`}
                      value={opt.text}
                      onChange={(e) => {
                        const updated = [...form.options];
                        updated[idx].text = e.target.value;
                        setForm({ ...form, options: updated });
                      }}
                    />

                    {form.qType === "mcq" && form.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = form.options.filter((_, i) => i !== idx);
                          if (opt.is_correct && updated.length > 0) {
                            updated[0].is_correct = true;
                          }
                          setForm({ ...form, options: updated });
                        }}
                        className="text-[#686760] hover:text-red-600 p-1 text-xs"
                        title="Remove option"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subject & Topic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Subject</label>
              <input
                className="input text-xs sm:text-sm"
                placeholder="e.g. Computer Science"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Topic</label>
              <input
                className="input text-xs sm:text-sm"
                placeholder="e.g. Normalization"
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
              />
            </div>
          </div>

          {/* Difficulty, Bloom's Level & Marks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Difficulty</label>
              <select
                className="input text-xs sm:text-sm"
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Bloom's Level</label>
              <select
                className="input text-xs sm:text-sm"
                value={form.blooms_level}
                onChange={(e) => setForm({ ...form, blooms_level: e.target.value })}
              >
                <option value="remember">Remember</option>
                <option value="understand">Understand</option>
                <option value="apply">Apply</option>
                <option value="analyze">Analyze</option>
                <option value="evaluate">Evaluate</option>
                <option value="create">Create</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Marks</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                className="input text-xs sm:text-sm"
                value={form.marks}
                onChange={(e) => setForm({ ...form, marks: parseFloat(e.target.value) || 1 })}
              />
            </div>
          </div>

          {/* Explanation */}
          <div>
            <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
              Explanation (Optional learning feedback for students)
            </label>
            <textarea
              className="input resize-y min-h-[60px] text-xs sm:text-sm"
              placeholder="Explain why the correct answer is right to assist student learning..."
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-black/[0.08] pt-4 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#686760] hover:text-[#1F1F1D] hover:bg-black/5 rounded-full transition"
          >
            Cancel
          </button>

          {!isEditing && (
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => handleSubmit(true)}
              className="px-4 py-2 text-xs sm:text-sm font-semibold bg-white border border-black/15 text-[#1F1F1D] hover:bg-black/5 rounded-full transition shadow-xs disabled:opacity-50"
            >
              Save & Create Another
            </button>
          )}

          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => handleSubmit(false)}
            className="px-5 py-2 text-xs sm:text-sm font-bold bg-[#1F1F1D] text-[#F3F1E9] hover:bg-black rounded-full transition shadow-sm disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : isEditing ? "Update Question" : "Save Question"}
          </button>
        </div>
      </div>
    </div>
  );
}
