import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { api } from "../lib/api";

export default function TeacherSettings() {
  const qc = useQueryClient();
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showAddStudentsModal, setShowAddStudentsModal] = useState<any>(null);
  const [className, setClassName] = useState("");
  const [classSubject, setClassSubject] = useState("");
  const [classSection, setClassSection] = useState("");
  const [studentsInput, setStudentsInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch Classrooms
  const { data: classrooms = [], isLoading } = useQuery({
    queryKey: ["classrooms"],
    queryFn: async () => (await api.get("/classrooms")).data,
  });

  // Create Classroom Mutation
  const createClassroomMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post("/classrooms", {
          name: className.trim(),
          subject: classSubject.trim() || null,
          section: classSection.trim() || null,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      setShowCreateClassModal(false);
      setClassName("");
      setClassSubject("");
      setClassSection("");
    },
    onError: (err: any) =>
      setErrorMsg(err.response?.data?.detail || "Failed to create classroom."),
  });

  // Add Students Mutation
  const addStudentsMutation = useMutation({
    mutationFn: async () => {
      // Parse email or roll numbers
      const lines = studentsInput
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const students = lines.map((line) => {
        const parts = line.split(",").map((p) => p.trim());
        return {
          email: parts[0],
          full_name: parts[1] || parts[0].split("@")[0],
          student_ref: parts[2] || null,
        };
      });
      return (
        await api.post(`/classrooms/${showAddStudentsModal.id}/students`, {
          students,
        })
      ).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      setShowAddStudentsModal(null);
      setStudentsInput("");
      alert(`Added ${data.added || 0} student(s) to classroom roster.`);
    },
    onError: (err: any) =>
      setErrorMsg(err.response?.data?.detail || "Failed to add students to classroom."),
  });

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
              Classrooms & Preferences
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Manage student rosters, course sections, and institutional settings.
            </p>
          </div>

          <button
            onClick={() => setShowCreateClassModal(true)}
            className="btn-primary text-xs sm:text-sm flex items-center gap-1.5 shadow-sm"
          >
            <span className="text-base leading-none">+</span>
            <span>Add Classroom</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} className="font-bold text-red-800">
              ✕
            </button>
          </div>
        )}

        {/* Classrooms Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#1F1F1D]">Your Classrooms ({classrooms.length})</h2>
          </div>

          {isLoading ? (
            <div className="card p-8 text-center text-xs text-[#686760]">Loading classrooms…</div>
          ) : classrooms.length === 0 ? (
            <div className="card p-8 text-center flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-xl mb-2">
                🏫
              </div>
              <h3 className="font-bold text-sm text-[#1F1F1D]">No classrooms configured</h3>
              <p className="text-xs text-[#686760] mt-1 max-w-sm">
                Create classrooms to organize students and restrict exam enrollments to verified rosters.
              </p>
              <button
                onClick={() => setShowCreateClassModal(true)}
                className="btn-primary text-xs mt-4"
              >
                + Create First Classroom
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {classrooms.map((c: any) => (
                <div key={c.id} className="card p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-[#1F1F1D]">{c.name}</h3>
                      <div className="text-xs text-[#686760] mt-0.5">
                        {c.subject || "General"} {c.section ? `• Section ${c.section}` : ""}
                      </div>
                    </div>
                    <span className="badge text-[11px] font-bold">
                      {c.member_count} enrolled
                    </span>
                  </div>

                  <div className="pt-2 border-t border-black/[0.08] flex items-center justify-between">
                    <span className="text-[11px] text-[#686760]">ID: {c.id.slice(0, 8)}...</span>
                    <button
                      onClick={() => setShowAddStudentsModal(c)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-black/10 hover:bg-black/5 text-[#1F1F1D] transition"
                    >
                      + Add Students
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Classroom Modal */}
        {showCreateClassModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                <h3 className="font-bold text-sm text-[#1F1F1D]">Create New Classroom</h3>
                <button
                  onClick={() => setShowCreateClassModal(false)}
                  className="w-6 h-6 rounded-full bg-white text-xs text-[#686760]"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                  Classroom Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. CS301 - Distributed Systems"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Subject</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Computer Science"
                    value={classSubject}
                    onChange={(e) => setClassSubject(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Section / Cohort</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Sec A (2026)"
                    value={classSection}
                    onChange={(e) => setClassSection(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.08]">
                <button
                  onClick={() => setShowCreateClassModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createClassroomMutation.mutate()}
                  disabled={!className.trim() || createClassroomMutation.isPending}
                  className="btn-primary text-xs shadow-sm"
                >
                  {createClassroomMutation.isPending ? "Creating…" : "Save Classroom"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Students to Classroom Modal */}
        {showAddStudentsModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                <div>
                  <h3 className="font-bold text-sm text-[#1F1F1D]">
                    Enroll Students — {showAddStudentsModal.name}
                  </h3>
                  <span className="text-xs text-[#686760]">Add student accounts to this class roster.</span>
                </div>
                <button
                  onClick={() => setShowAddStudentsModal(null)}
                  className="w-6 h-6 rounded-full bg-white text-xs text-[#686760]"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">
                  Student List (one per line, format: email, full_name, student_ref)
                </label>
                <textarea
                  className="input resize-y min-h-[120px] font-mono text-xs"
                  placeholder="alice@student.edu, Alice Smith, CS2026-01&#10;bob@student.edu, Bob Jones, CS2026-02"
                  value={studentsInput}
                  onChange={(e) => setStudentsInput(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.08]">
                <button
                  onClick={() => setShowAddStudentsModal(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => addStudentsMutation.mutate()}
                  disabled={!studentsInput.trim() || addStudentsMutation.isPending}
                  className="btn-primary text-xs shadow-sm"
                >
                  {addStudentsMutation.isPending ? "Adding…" : "Add Students"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
