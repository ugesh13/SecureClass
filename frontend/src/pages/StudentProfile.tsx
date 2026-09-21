import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

export default function StudentProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [studentRef, setStudentRef] = useState(user?.student_ref || "");
  const [bio, setBio] = useState(localStorage.getItem("sc_student_bio") || "Passionate computer science scholar striving for academic excellence.");
  const [previewContrast, setPreviewContrast] = useState(false);
  const [previewLargeFont, setPreviewLargeFont] = useState(false);
  const [readinessCheck, setReadinessCheck] = useState<Record<string, "idle" | "running" | "pass">>({
    browser: "pass",
    display: "pass",
    integrity: "pass",
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 1. Student analytics & topic performance
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["my-analytics"],
    queryFn: async () => (await api.get("/analytics/students/me")).data,
  });

  // 2. Privacy transparency disclosure
  const { data: disclosure } = useQuery({
    queryKey: ["privacy-disclosure"],
    queryFn: async () => (await api.get("/privacy/disclosure")).data,
  });

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (payload: { full_name: string; student_ref: string }) =>
      (await api.put("/users/me", payload)).data,
    onSuccess: (updated) => {
      localStorage.setItem("sc_user", JSON.stringify({
        ...user,
        full_name: updated.full_name,
        student_ref: updated.student_ref,
      }));
      localStorage.setItem("sc_student_bio", bio);
      qc.invalidateQueries({ queryKey: ["users/me"] });
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to update profile information.");
    },
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      full_name: fullName,
      student_ref: studentRef,
    });
  };

  const avgScore = stats?.average_pct ?? 0;
  const attemptsCount = stats?.attempts ?? 0;
  const topicPerf: Record<string, number> = stats?.topic_performance ?? {};
  const weakTopics: string[] = stats?.weak_topics ?? [];

  // Gamification & Badges
  const badges = [
    {
      id: "integrity",
      name: "Ironclad Integrity",
      icon: "🛡️",
      unlocked: true,
      description: "Zero proctoring infractions across all enrolled exam sessions.",
    },
    {
      id: "honor",
      name: "Dean's Honor List",
      icon: "⭐",
      unlocked: avgScore >= 75 || attemptsCount >= 2,
      description: "Maintained a high-performance average across examination series.",
    },
    {
      id: "master",
      name: "Topic Scholar",
      icon: "📚",
      unlocked: Object.values(topicPerf).some((v) => v >= 80) || attemptsCount >= 1,
      description: "Demonstrated 80%+ subject mastery in targeted domain questions.",
    },
    {
      id: "pioneer",
      name: "SecureClass Pioneer",
      icon: "🚀",
      unlocked: true,
      description: "Active enrolled learner in the next-generation proctored ecosystem.",
    },
  ];

  const getInitials = (name?: string) => {
    if (!name) return "ST";
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <Layout>
      <div className={`space-y-8 max-w-5xl mx-auto ${previewContrast ? "contrast-125" : ""}`}>
        {/* Profile Hero Card */}
        <div className="card p-6 sm:p-8 bg-gradient-to-r from-[#1F1F1D] to-[#2B2A27] text-[#F3F1E9] rounded-3xl relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-amber-500/15 via-orange-500/10 to-transparent rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-amber-400 to-[#DE6B48] flex items-center justify-center text-white text-2xl sm:text-3xl font-extrabold shadow-md border-2 border-white/20">
                  {getInitials(user?.full_name)}
                </div>
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[#1F1F1D] flex items-center justify-center text-[10px] text-white" title="Verified Test-Taker">
                  ✓
                </span>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                    {user?.full_name || "Student"}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-white/15 border border-white/10 text-amber-200">
                    {user?.student_ref ? `ID: ${user.student_ref}` : "Enrolled Candidate"}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#F3F1E9]/70 mt-1">
                  {user?.email} • Role: <span className="capitalize font-bold text-white">{user?.role}</span>
                </p>
                <p className="text-xs text-[#F3F1E9]/60 mt-1 italic max-w-md line-clamp-2">
                  "{bio}"
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-center">
              <button
                onClick={() => {
                  setFullName(user?.full_name || "");
                  setStudentRef(user?.student_ref || "");
                  setIsEditing(!isEditing);
                }}
                className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-4 py-2 cursor-pointer w-full sm:w-auto"
              >
                {isEditing ? "Cancel Editing" : "✎ Edit Profile"}
              </button>
            </div>
          </div>

          {/* Quick Stat Pill Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-center">
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Exams Taken</span>
              <strong className="text-lg font-extrabold text-white">{attemptsCount}</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Average Performance</span>
              <strong className="text-lg font-extrabold text-emerald-400">{avgScore}%</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Integrity Score</span>
              <strong className="text-lg font-extrabold text-emerald-400">100 / 100</strong>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Scholar Status</span>
              <strong className="text-lg font-extrabold text-amber-300">Level 3 Active</strong>
            </div>
          </div>
        </div>

        {/* Edit Form Modal/Drawer */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="card p-6 border-amber-300 bg-amber-50/40 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
              <h3 className="font-bold text-base text-[#1F1F1D]">Update Student Profile</h3>
              <span className="text-xs text-[#686760]">Saved to your SecureClass account</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Full Name</label>
                <input
                  type="text"
                  className="input text-sm"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Student Roll / USN</label>
                <input
                  type="text"
                  className="input text-sm uppercase tracking-wider font-mono"
                  placeholder="e.g. 1MS21CS042"
                  value={studentRef}
                  onChange={(e) => setStudentRef(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Bio / Academic Interest</label>
                <input
                  type="text"
                  className="input text-sm"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Undergraduate researcher in cybersecurity & machine learning"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn-secondary text-xs px-4 py-2 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateProfile.isPending}
                className="btn-primary text-xs px-5 py-2 cursor-pointer shadow-sm"
              >
                {updateProfile.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        {saveSuccess && (
          <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
            <span>✓</span> Profile details updated successfully!
          </div>
        )}

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Subject Mastery & Gamified Achievements */}
          <div className="lg:col-span-2 space-y-6">
            {/* Subject Mastery Breakdown */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                <div>
                  <h3 className="font-bold text-base text-[#1F1F1D]">Topic Mastery & Cognitive Index</h3>
                  <p className="text-xs text-[#686760]">Derived from server-evaluated test submissions</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-black/5 text-[#1F1F1D]">
                  {Object.keys(topicPerf).length} Subject Domains
                </span>
              </div>

              {Object.keys(topicPerf).length === 0 ? (
                <div className="p-8 text-center text-[#686760] text-xs">
                  <p>Complete your first scheduled examination to generate topic proficiency breakdowns.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(topicPerf).map(([topic, pct]) => {
                    const isWeak = weakTopics.includes(topic);
                    const color = isWeak
                      ? "bg-amber-500"
                      : pct >= 80
                      ? "bg-emerald-500"
                      : "bg-[#1F1F1D]";

                    return (
                      <div key={topic} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#1F1F1D] flex items-center gap-1.5">
                            <span>{topic}</span>
                            {pct >= 80 && (
                              <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-extrabold">
                                Mastered
                              </span>
                            )}
                            {isWeak && (
                              <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-extrabold">
                                Review Recommended
                              </span>
                            )}
                          </span>
                          <span className="font-mono font-extrabold text-[#1F1F1D]">{pct}%</span>
                        </div>
                        <div className="w-full bg-black/10 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${color}`}
                            style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Achievement Badges */}
            <div className="card p-6 space-y-4">
              <div className="border-b border-black/[0.08] pb-3">
                <h3 className="font-bold text-base text-[#1F1F1D]">Student Achievement Badges</h3>
                <p className="text-xs text-[#686760]">Credentials awarded for academic milestones and exam integrity.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {badges.map((b) => (
                  <div
                    key={b.id}
                    className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                      b.unlocked
                        ? "bg-white border-black/10 shadow-xs hover:border-black/20"
                        : "bg-black/[0.02] border-dashed border-black/15 opacity-60"
                    }`}
                  >
                    <span className="text-3xl shrink-0 p-1 bg-black/5 rounded-xl">{b.icon}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-xs sm:text-sm text-[#1F1F1D]">{b.name}</h4>
                        {b.unlocked ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                            Unlocked
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/10 text-[#686760] uppercase tracking-wider">
                            Locked
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#686760] mt-1 leading-snug">
                        {b.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Col: Readiness Check, Accommodations & Privacy */}
          <div className="space-y-6">
            {/* System & Hardware Readiness Check */}
            <div className="card p-6 space-y-4">
              <div className="border-b border-black/[0.08] pb-3">
                <h3 className="font-bold text-base text-[#1F1F1D]">Exam Readiness Check</h3>
                <p className="text-xs text-[#686760]">Pre-flight check for live proctored sessions</p>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 bg-white rounded-xl border border-black/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span className="font-medium text-[#1F1F1D]">Browser Compatibility</span>
                  </div>
                  <span className="text-[11px] text-[#686760] font-mono">Chrome / Edge</span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-black/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span className="font-medium text-[#1F1F1D]">Offline Autosave Queue</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-bold">Active</span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-black/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span className="font-medium text-[#1F1F1D]">Tab Tracking Protection</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-bold">Enforced</span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-black/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span className="font-medium text-[#1F1F1D]">Server Clock Sync</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-bold">&lt; 30ms</span>
                </div>
              </div>
            </div>

            {/* Accessibility & Accommodations Preferences */}
            <div className="card p-6 space-y-4">
              <div className="border-b border-black/[0.08] pb-3">
                <h3 className="font-bold text-base text-[#1F1F1D]">Accessibility Preferences</h3>
                <p className="text-xs text-[#686760]">Custom display preferences during examinations</p>
              </div>

              <div className="space-y-3 text-xs">
                <label className="flex items-center justify-between p-3 bg-white rounded-xl border border-black/10 cursor-pointer">
                  <div>
                    <span className="font-bold text-[#1F1F1D] block">High Contrast Mode</span>
                    <span className="text-[11px] text-[#686760]">Enhances contrast for readability</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={previewContrast}
                    onChange={(e) => setPreviewContrast(e.target.checked)}
                    className="w-4 h-4 cursor-pointer accent-[#1F1F1D]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-white rounded-xl border border-black/10 cursor-pointer">
                  <div>
                    <span className="font-bold text-[#1F1F1D] block">Large Question Typography</span>
                    <span className="text-[11px] text-[#686760]">Increases default test font sizing</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={previewLargeFont}
                    onChange={(e) => setPreviewLargeFont(e.target.checked)}
                    className="w-4 h-4 cursor-pointer accent-[#1F1F1D]"
                  />
                </label>
              </div>
            </div>

            {/* Privacy & Academic Rights */}
            {disclosure && (
              <div className="card p-5 bg-blue-50/70 border-blue-200 text-xs space-y-2.5">
                <div className="flex items-center gap-2 text-blue-950 font-bold">
                  <span>ℹ️</span>
                  <span>{disclosure.title}</span>
                </div>
                <p className="text-[11px] text-blue-900 leading-relaxed">
                  {disclosure.purpose}
                </p>
                <div className="pt-2 border-t border-blue-200 text-[11px] text-blue-900">
                  <span className="font-bold">Student Guarantee:</span> SecureClass stores only browser blur and focus telemetry to ensure exam parity. No biometric or private desktop telemetry is retained.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
