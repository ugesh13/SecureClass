import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { api, wsBase } from "../lib/api";

type LiveEvent = {
  id?: string;
  event: string;
  attempt_id?: string;
  student_id?: string;
  student_name?: string;
  usn?: string;
  section?: string;
  event_type?: string;
  integrity_score?: number;
  duration_seconds?: number;
  target_app_or_url?: string;
  focus_status?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score?: number;
  announcement?: string;
  at?: string;
  opened_at?: string;
  closed_at?: string;
  target_category?: string;
  violation_flags?: string[];
  metadata?: any;
};

type StudentRosterItem = {
  student_id: string;
  student_name: string;
  usn: string;
  section: string;
  attempt_id: string | null;
  status: "not_started" | "in_progress" | "submitted" | "pending_approval" | "locked";
  score: number | null;
  focus_status: "FOCUSED" | "AWAY" | "SUBMITTED";
  integrity_score: number;
  total_switches: number;
  accumulated_away_seconds: number;
  last_departure_at: string | null;
  last_target: string;
  risk_score: number;
  threat_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  has_cheating_site?: boolean;
  has_prolonged_absence?: boolean;
  has_excessive_switches?: boolean;
  violation_tags?: string[];
  recent_events: {
    id: string;
    event_type: string;
    at: string;
    opened_at?: string;
    closed_at?: string;
    duration_seconds?: number;
    target?: string;
    target_category?: string;
    severity?: string;
    status?: string;
    is_cheating_site?: boolean;
    violation_flags?: string[];
  }[];
};

export default function TeacherMonitor() {
  const { id: examId } = useParams();
  const qc = useQueryClient();

  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [roster, setRoster] = useState<StudentRosterItem[]>([]);
  const [viewMode, setViewMode] = useState<"matrix" | "stream">("matrix");
  const [filterTab, setFilterTab] = useState<"all" | "away" | "flagged" | "cheating" | "switches" | "long_away" | "focused" | "submitted">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRosterItem | null>(null);

  // Modals & Action States
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [targetStudentWarn, setTargetStudentWarn] = useState<StudentRosterItem | null>(null);
  const [targetWarnText, setTargetWarnText] = useState("");
  const [showManualGradeModal, setShowManualGradeModal] = useState<{ aid: string; studentName: string } | null>(null);
  const [manualScore, setManualScore] = useState<number>(0);
  const [manualReason, setManualReason] = useState<string>("");
  const [regradePreviewData, setRegradePreviewData] = useState<any>(null);
  const [nowSecs, setNowSecs] = useState<number>(Date.now());

  // Ticker for ticking seconds away on departed students
  useEffect(() => {
    const t = setInterval(() => setNowSecs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch Exam Metadata
  const { data: exam, refetch: refetchExam } = useQuery({
    queryKey: ["exam", examId],
    queryFn: async () => (await api.get(`/exams/${examId}`)).data,
    enabled: !!examId,
  });

  // Fetch Initial Live Roster
  const { refetch: refetchRoster } = useQuery({
    queryKey: ["exam-roster", examId],
    queryFn: async () => {
      const { data } = await api.get(`/exams/${examId}/live-roster`);
      setRoster(data);
      return data;
    },
    enabled: !!examId,
    refetchInterval: 12000, // Background sync fallback
  });

  // Emergency Exam Controls
  const pauseExam = useMutation({
    mutationFn: async () => (await api.post(`/exams/${examId}/emergency/pause`)).data,
    onSuccess: () => refetchExam(),
  });

  const resumeExam = useMutation({
    mutationFn: async () => (await api.post(`/exams/${examId}/emergency/resume`)).data,
    onSuccess: () => refetchExam(),
  });

  const extendTime = useMutation({
    mutationFn: async (minutes: number) =>
      (await api.post(`/exams/${examId}/emergency/extend-time`, { action: "extend_time", extra_minutes: minutes })).data,
    onSuccess: (data) => {
      alert(`Extended exam duration by +${data.extra_minutes} minutes for all active test-takers.`);
    },
  });

  const broadcastAnnouncement = useMutation({
    mutationFn: async (text: string) =>
      (await api.post(`/exams/${examId}/emergency/announce`, { action: "announce", announcement: text })).data,
    onSuccess: () => {
      setAnnouncementText("");
      setShowAnnounceModal(false);
    },
  });

  // Individual Student Controls
  const warnStudentMutation = useMutation({
    mutationFn: async ({ sid, msg }: { sid: string; msg: string }) =>
      (await api.post(`/exams/${examId}/students/${sid}/warn`, { announcement: msg })).data,
    onSuccess: () => {
      alert("Proctor warning sent directly to student's screen.");
      setTargetStudentWarn(null);
      setTargetWarnText("");
    },
  });

  const pauseStudentMutation = useMutation({
    mutationFn: async (sid: string) =>
      (await api.post(`/exams/${examId}/students/${sid}/pause`)).data,
    onSuccess: () => {
      refetchRoster();
      alert("Student session locked & paused.");
    },
  });

  const resumeStudentMutation = useMutation({
    mutationFn: async (sid: string) =>
      (await api.post(`/exams/${examId}/students/${sid}/resume`)).data,
    onSuccess: () => {
      refetchRoster();
      alert("Student session unlocked & resumed.");
    },
  });

  const manualGradeMutation = useMutation({
    mutationFn: async ({ aid, score, reason }: { aid: string; score: number; reason: string }) =>
      (await api.post(`/attempts/${aid}/manual-grade`, { new_score: score, reason })).data,
    onSuccess: () => {
      alert("Score adjusted and audit entry logged.");
      setShowManualGradeModal(null);
      setManualReason("");
      refetchRoster();
    },
  });

  const regradePreview = useMutation({
    mutationFn: async () => (await api.post(`/exams/${examId}/regrade-preview`)).data,
    onSuccess: (data) => setRegradePreviewData(data),
  });

  const commitRegrade = useMutation({
    mutationFn: async () =>
      (await api.post(`/exams/${examId}/regrade?reason=Key correction and moderation`)).data,
    onSuccess: (data) => {
      alert(`Regrade complete: updated ${data.regraded_attempts} student attempts.`);
      setRegradePreviewData(null);
      refetchRoster();
    },
  });

  // Live WebSocket Connection & Telemetry Aggregator
  useEffect(() => {
    const token = localStorage.getItem("sc_token");
    if (!token || !examId) return;

    const url = `${wsBase()}/exams/${examId}/teacher?token=${token}`;
    const ws = new WebSocket(url);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      try {
        const data: LiveEvent = JSON.parse(msg.data);
        const at = data.at || new Date().toISOString();

        // Append to raw stream
        setEvents((prev) => [{ ...data, at }, ...prev].slice(0, 300));

        // State Machine: Update real-time roster matrix
        if (data.student_id) {
          setRoster((prev) => {
            const idx = prev.findIndex((s) => s.student_id === data.student_id);
            if (idx === -1) {
              // Add newly discovered student
              const newItem: StudentRosterItem = {
                student_id: data.student_id!,
                student_name: data.student_name || "Student",
                usn: data.usn || `USN-${data.student_id!.slice(0, 6).toUpperCase()}`,
                section: data.section || "Classroom",
                attempt_id: data.attempt_id || null,
                status: "in_progress",
                score: data.score ?? null,
                focus_status: (data.focus_status as any) || "FOCUSED",
                integrity_score: data.integrity_score || 0,
                total_switches: (data.focus_status === "AWAY" || data.event_type?.includes("DEPART") || data.event_type?.includes("SWITCH") || data.event_type?.includes("TAB")) ? 1 : 0,
                accumulated_away_seconds: data.duration_seconds || 0,
                last_departure_at: data.focus_status === "AWAY" ? (data.opened_at || at) : null,
                last_target: data.target_app_or_url || "—",
                risk_score: 10,
                threat_level: data.severity || "LOW",
                recent_events: [
                  {
                    id: String(Date.now()),
                    event_type: data.event_type || data.event,
                    at,
                    opened_at: data.opened_at || at,
                    closed_at: data.closed_at,
                    duration_seconds: data.duration_seconds,
                    target: data.target_app_or_url,
                    target_category: data.target_category,
                    severity: data.severity,
                    status: data.focus_status,
                    violation_flags: data.violation_flags,
                  },
                ],
              };
              return [newItem, ...prev];
            }

            const current = { ...prev[idx] };
            const isDeparted = data.focus_status === "AWAY" || data.event_type === "STUDENT_DEPARTED" || data.event_type === "TAB_OR_WINDOW_LEFT" || data.event_type === "SHORTCUT_NEW_TAB" || data.event_type === "NON_BROWSER_APP_SWITCH" || data.event_type === "TAB_CREATED" || data.event_type === "EXTERNAL_TAB_SWITCH" || data.event_type === "EXTERNAL_NAVIGATION";
            const isReturned = data.focus_status === "FOCUSED" || data.event_type === "STUDENT_RETURNED" || data.event_type === "TAB_OR_WINDOW_RETURNED" || data.event_type === "EXAM_TAB_FOCUSED";

            if (isDeparted) {
              current.focus_status = "AWAY";
              current.last_departure_at = data.opened_at || at;
              current.total_switches += 1;
            } else if (isReturned) {
              current.focus_status = "FOCUSED";
              current.last_departure_at = null;
            }

            if (data.event === "exam_submitted") {
              current.status = "submitted";
              current.focus_status = "SUBMITTED";
              if (data.score !== undefined) current.score = data.score;
            }

            if (data.duration_seconds) {
              current.accumulated_away_seconds = Math.round((current.accumulated_away_seconds + data.duration_seconds) * 10) / 10;
            }

            if (data.target_app_or_url) {
              current.last_target = data.target_app_or_url;
            }

            if (data.violation_flags && data.violation_flags.length > 0) {
              const merged = new Set([...(current.violation_tags || []), ...data.violation_flags]);
              current.violation_tags = Array.from(merged);
            }

            if (data.integrity_score !== undefined) {
              current.integrity_score = data.integrity_score;
            }

            // Recalculate cheat risk
            const isCheat = data.severity === "CRITICAL" || data.target_category === "AI_ASSISTANT" || data.target_category === "HOMEWORK_SOLVER";
            const newRisk = Math.min(
              100,
              Math.round(
                current.total_switches * 10 +
                  Math.min(60, current.accumulated_away_seconds / 5) * 5 +
                  current.integrity_score * 8 +
                  (isCheat ? 40 : data.severity === "HIGH" ? 20 : 0)
              )
            );
            current.risk_score = newRisk;
            current.threat_level = newRisk >= 60 || isCheat ? "CRITICAL" : newRisk >= 35 ? "HIGH" : newRisk >= 15 ? "MEDIUM" : "LOW";
            if (isCheat) current.has_cheating_site = true;

            // Add to student's recent events list
            current.recent_events = [
              {
                id: String(Date.now()),
                event_type: data.event_type || data.event,
                at,
                opened_at: data.opened_at || at,
                closed_at: data.closed_at,
                duration_seconds: data.duration_seconds,
                target: data.target_app_or_url,
                target_category: data.target_category,
                severity: data.severity,
                status: data.focus_status,
                violation_flags: data.violation_flags,
              },
              ...current.recent_events,
            ].slice(0, 20);

            const updated = [...prev];
            updated[idx] = current;
            return updated;
          });
        }
      } catch {}
    };

    return () => ws.close();
  }, [examId]);

  // Keep selected student synced with roster updates
  useEffect(() => {
    if (selectedStudent) {
      const match = roster.find((s) => s.student_id === selectedStudent.student_id);
      if (match) setSelectedStudent(match);
    }
  }, [roster]);

  // Metrics summary
  const totalCount = roster.length;
  const awayCount = roster.filter((s) => s.focus_status === "AWAY").length;
  const flaggedCount = roster.filter((s) => s.threat_level === "HIGH" || s.threat_level === "CRITICAL" || s.risk_score >= 35).length;
  const cheatingCount = roster.filter((s) => s.has_cheating_site || s.violation_tags?.some(t => t.toLowerCase().includes("cheat") || t.toLowerCase().includes("ai")) || ["chatgpt", "claude", "chegg", "brainly"].some(k => (s.last_target || "").toLowerCase().includes(k))).length;
  const excessiveSwitchesCount = roster.filter((s) => s.total_switches >= 3).length;
  const longAwayCount = roster.filter((s) => s.accumulated_away_seconds >= 20 || (s.focus_status === "AWAY" && s.last_departure_at && Math.floor((nowSecs - new Date(s.last_departure_at).getTime()) / 1000) >= 20)).length;
  const focusedCount = roster.filter((s) => s.focus_status === "FOCUSED").length;
  const submittedCount = roster.filter((s) => s.status === "submitted").length;

  const getLiveAwaySeconds = (s: StudentRosterItem) => {
    if (s.focus_status !== "AWAY" || !s.last_departure_at) return 0;
    const diff = Math.max(0, Math.floor((nowSecs - new Date(s.last_departure_at).getTime()) / 1000));
    return diff;
  };

  // Filtered Roster for Matrix View
  const filteredRoster = useMemo(() => {
    return roster.filter((s) => {
      // Tab filter
      if (filterTab === "away" && s.focus_status !== "AWAY") return false;
      if (filterTab === "flagged" && s.threat_level !== "HIGH" && s.threat_level !== "CRITICAL") return false;
      if (filterTab === "cheating") {
        const isCheat = s.has_cheating_site || s.violation_tags?.some(t => t.toLowerCase().includes("cheat") || t.toLowerCase().includes("ai")) || ["chatgpt", "claude", "perplexity", "chegg", "brainly"].some(k => (s.last_target || "").toLowerCase().includes(k));
        if (!isCheat) return false;
      }
      if (filterTab === "switches" && s.total_switches < 3) return false;
      if (filterTab === "long_away" && s.accumulated_away_seconds < 20 && getLiveAwaySeconds(s) < 20) return false;
      if (filterTab === "focused" && s.focus_status !== "FOCUSED") return false;
      if (filterTab === "submitted" && s.status !== "submitted") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.student_name.toLowerCase().includes(q);
        const matchUsn = s.usn.toLowerCase().includes(q);
        const matchSection = s.section.toLowerCase().includes(q);
        const matchTarget = (s.last_target || "").toLowerCase().includes(q);
        if (!matchName && !matchUsn && !matchSection && !matchTarget) return false;
      }
      return true;
    });
  }, [roster, filterTab, searchQuery, nowSecs]);

  const formatSeconds = (secs: number) => {
    if (secs < 60) return `${Math.round(secs)}s`;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}m ${s}s`;
  };

  const getTargetBadge = (target: string, cat?: string) => {
    const t = (target || "").toLowerCase();
    if (t.includes("chatgpt") || t.includes("claude") || t.includes("perplexity") || t.includes("gemini") || cat === "AI_ASSISTANT") {
      return { icon: "🤖", label: "AI Assistant", tagColor: "bg-rose-100 text-rose-800 border-rose-300 font-bold" };
    }
    if (t.includes("chegg") || t.includes("brainly") || t.includes("quizlet") || cat === "HOMEWORK_SOLVER") {
      return { icon: "📚", label: "Solver Site", tagColor: "bg-orange-100 text-orange-800 border-orange-300 font-bold" };
    }
    if (t.includes("stackoverflow") || t.includes("github") || t.includes("leetcode") || cat === "CODE_OR_FORUM") {
      return { icon: "💻", label: "Code Forum", tagColor: "bg-purple-100 text-purple-800 border-purple-300 font-bold" };
    }
    if (t.includes("discord") || t.includes("telegram") || t.includes("whatsapp") || t.includes("teams") || cat === "MESSAGING_APP") {
      return { icon: "💬", label: "Messaging App", tagColor: "bg-rose-100 text-rose-800 border-rose-300 font-bold" };
    }
    if (t.includes(".exe") || t.includes("code.exe") || t.includes("task switch") || cat === "PROHIBITED_DESKTOP_APP") {
      return { icon: "🖥️", label: "Desktop App", tagColor: "bg-amber-100 text-amber-800 border-amber-300 font-bold" };
    }
    return { icon: "🌐", label: "External Web", tagColor: "bg-blue-50 text-blue-800 border-blue-200" };
  };

  const exportCsvReport = async () => {
    try {
      const res = await api.get(`/exams/${examId}/proctor-report?format=csv`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `proctor_audit_exam_${(examId || "").slice(0, 8)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert("Failed to export proctor report.");
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Top Header & Session Moderation Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
                {exam?.title || "Exam Proctor Monitor"}
              </h1>
              <span
                className={`badge text-[11px] font-bold ${
                  connected
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                }`}
              >
                {connected ? "● Live Telemetry Active" : "○ Reconnecting…"}
              </span>
              {exam?.is_paused && (
                <span className="badge bg-[#DE6B48] text-white font-bold animate-pulse">
                  SESSION PAUSED
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#686760] mt-1">
              Real-time focus tracking, external application detection, and live moderation controls.
            </p>
          </div>

          {/* Emergency Command Center Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {exam?.is_paused ? (
              <button
                onClick={() => resumeExam.mutate()}
                disabled={resumeExam.isPending}
                className="btn-primary bg-emerald-800 hover:bg-emerald-900 text-xs py-2 px-4 shadow-xs"
              >
                ▶ Resume Exam
              </button>
            ) : (
              <button
                onClick={() => pauseExam.mutate()}
                disabled={pauseExam.isPending}
                className="btn-danger text-xs py-2 px-4 shadow-xs"
              >
                ⏸ Pause All
              </button>
            )}

            <button
              onClick={() => extendTime.mutate(5)}
              disabled={extendTime.isPending}
              className="btn-secondary text-xs py-2 px-3"
            >
              +5m All
            </button>
            <button
              onClick={() => extendTime.mutate(15)}
              disabled={extendTime.isPending}
              className="btn-secondary text-xs py-2 px-3"
            >
              +15m All
            </button>

            <button
              onClick={() => setShowAnnounceModal(true)}
              className="btn-secondary text-xs py-2 px-3"
            >
              📢 Announce
            </button>

            <button
              onClick={() => regradePreview.mutate()}
              disabled={regradePreview.isPending}
              className="btn-secondary text-xs py-2 px-3"
            >
              Regrade Key
            </button>

            <button
              onClick={exportCsvReport}
              className="btn-secondary text-xs py-2 px-3.5 bg-blue-50 border-blue-200 text-blue-900 font-bold hover:bg-blue-100 flex items-center gap-1.5 shadow-xs"
              title="Download full student audit trail and violation records as CSV"
            >
              📥 Export Audit (CSV)
            </button>
          </div>
        </div>

        {/* High-Level Proctor KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="card p-4 sm:p-5">
            <span className="text-xs font-semibold text-[#686760]">Enrolled Students</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] mt-1">
              {totalCount}
            </div>
            <div className="text-[11px] text-[#686760] mt-0.5">Scale: 60+ concurrent</div>
          </div>

          <div
            onClick={() => setFilterTab("away")}
            className={`card p-4 sm:p-5 cursor-pointer transition ${
              filterTab === "away" ? "ring-2 ring-amber-500 bg-amber-50/50" : "hover:border-amber-300"
            }`}
          >
            <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${awayCount > 0 ? "bg-amber-500 animate-ping" : "bg-gray-300"}`} />
              Currently Away
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-800 mt-1">
              {awayCount}
            </div>
            <div className="text-[11px] text-amber-700/80 mt-0.5">Off exam window now</div>
          </div>

          <div
            onClick={() => setFilterTab("cheating")}
            className={`card p-4 sm:p-5 cursor-pointer transition ${
              filterTab === "cheating" ? "ring-2 ring-rose-500 bg-rose-50/50" : "hover:border-rose-300"
            }`}
          >
            <span className="text-xs font-semibold text-rose-900 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cheatingCount > 0 ? "bg-rose-600 animate-ping" : "bg-gray-300"}`} />
              Cheating Sites
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-700 mt-1">
              {cheatingCount}
            </div>
            <div className="text-[11px] text-rose-700/80 mt-0.5">AI / Solvers visited</div>
          </div>

          <div
            onClick={() => setFilterTab("flagged")}
            className={`card p-4 sm:p-5 cursor-pointer transition ${
              filterTab === "flagged" ? "ring-2 ring-purple-500 bg-purple-50/50" : "hover:border-purple-300"
            }`}
          >
            <span className="text-xs font-semibold text-purple-900 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${flaggedCount > 0 ? "bg-purple-500 animate-ping" : "bg-gray-300"}`} />
              All Violations
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-purple-700 mt-1">
              {flaggedCount}
            </div>
            <div className="text-[11px] text-purple-700/80 mt-0.5">High/critical risk</div>
          </div>

          <div
            onClick={() => setFilterTab("focused")}
            className={`card p-4 sm:p-5 cursor-pointer transition ${
              filterTab === "focused" ? "ring-2 ring-emerald-500 bg-emerald-50/50" : "hover:border-emerald-300"
            }`}
          >
            <span className="text-xs font-semibold text-emerald-900">Actively Focused</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-800 mt-1">
              {focusedCount}
            </div>
            <div className="text-[11px] text-emerald-700/80 mt-0.5">In exam window</div>
          </div>

          <div
            onClick={() => setFilterTab("submitted")}
            className={`card p-4 sm:p-5 cursor-pointer transition ${
              filterTab === "submitted" ? "ring-2 ring-blue-500 bg-blue-50/50" : "hover:border-blue-300"
            }`}
          >
            <span className="text-xs font-semibold text-blue-900">Completed</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-blue-800 mt-1">
              {submittedCount}
            </div>
            <div className="text-[11px] text-blue-700/80 mt-0.5">Submitted & scored</div>
          </div>
        </div>

        {/* View Switcher, Filter Pills & Search Bar */}
        <div className="card p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setFilterTab("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "all"
                    ? "bg-[#1F1F1D] text-white shadow-xs"
                    : "bg-black/[0.04] text-[#686760] hover:bg-black/10"
                }`}
              >
                All ({totalCount})
              </button>
              <button
                onClick={() => setFilterTab("away")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "away"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-amber-100 text-amber-900 hover:bg-amber-200"
                }`}
              >
                Away ({awayCount})
              </button>
              <button
                onClick={() => setFilterTab("cheating")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "cheating"
                    ? "bg-rose-700 text-white shadow-xs"
                    : "bg-rose-100 text-rose-900 hover:bg-rose-200"
                }`}
              >
                🤖 Cheating Sites ({cheatingCount})
              </button>
              <button
                onClick={() => setFilterTab("switches")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "switches"
                    ? "bg-purple-700 text-white shadow-xs"
                    : "bg-purple-100 text-purple-900 hover:bg-purple-200"
                }`}
              >
                ⚡ 3+ Switches ({excessiveSwitchesCount})
              </button>
              <button
                onClick={() => setFilterTab("long_away")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "long_away"
                    ? "bg-orange-700 text-white shadow-xs"
                    : "bg-orange-100 text-orange-900 hover:bg-orange-200"
                }`}
              >
                ⏳ &gt;20s Away ({longAwayCount})
              </button>
              <button
                onClick={() => setFilterTab("flagged")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "flagged"
                    ? "bg-red-800 text-white shadow-xs"
                    : "bg-red-100 text-red-900 hover:bg-red-200"
                }`}
              >
                High Risk ({flaggedCount})
              </button>
              <button
                onClick={() => setFilterTab("focused")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "focused"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                }`}
              >
                Focused ({focusedCount})
              </button>
              <button
                onClick={() => setFilterTab("submitted")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  filterTab === "submitted"
                    ? "bg-blue-700 text-white shadow-xs"
                    : "bg-blue-100 text-blue-900 hover:bg-blue-200"
                }`}
              >
                Submitted ({submittedCount})
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 border border-black/10 p-1 rounded-xl bg-white/70">
              <button
                onClick={() => setViewMode("matrix")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  viewMode === "matrix" ? "bg-[#1F1F1D] text-white shadow-xs" : "text-[#686760] hover:text-black"
                }`}
              >
                ▦ Matrix Grid
              </button>
              <button
                onClick={() => setViewMode("stream")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  viewMode === "stream" ? "bg-[#1F1F1D] text-white shadow-xs" : "text-[#686760] hover:text-black"
                }`}
              >
                📜 Audit Stream
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by student name, USN / ID, or section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 text-xs sm:text-sm bg-white"
            />
            <span className="absolute left-3 top-2.5 text-[#8E8C82] text-sm">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-[#8E8C82] hover:text-black text-xs font-bold"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {/* ================= VIEW MODE 1: THE 60+ STUDENT MATRIX GRID ================= */}
        {viewMode === "matrix" && (
          <div className="space-y-4">
            {filteredRoster.length === 0 ? (
              <div className="card p-12 text-center text-xs text-[#686760] space-y-2">
                <div className="text-3xl">👥</div>
                <div className="font-bold text-sm text-[#1F1F1D]">No student matches found</div>
                <p>Try clearing filters or checking if students have opened the exam link.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
                {filteredRoster.map((s) => {
                  const isAway = s.focus_status === "AWAY";
                  const isSubmitted = s.status === "submitted";
                  const liveAway = getLiveAwaySeconds(s);
                  const isCritical = s.threat_level === "CRITICAL" || liveAway >= 20;

                  return (
                    <div
                      key={s.student_id}
                      onClick={() => setSelectedStudent(s)}
                      className={`card p-4 flex flex-col justify-between cursor-pointer transition-all duration-200 border-2 hover:shadow-md ${
                        isAway
                          ? isCritical
                            ? "border-rose-500 bg-rose-50/60 ring-2 ring-rose-200"
                            : "border-amber-400 bg-amber-50/60 ring-1 ring-amber-200"
                          : isSubmitted
                          ? "border-blue-200 bg-white/70"
                          : "border-emerald-300/80 bg-white hover:border-emerald-400"
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Card Header: Student Name, USN, Status Indicator */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-sm text-[#1F1F1D] truncate leading-tight">
                              {s.student_name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] font-bold text-[#686760] bg-black/[0.05] px-1.5 py-0.2 rounded">
                                {s.usn}
                              </span>
                              <span className="text-[10px] text-[#8E8C82] truncate max-w-[110px]">
                                {s.section}
                              </span>
                            </div>
                          </div>

                          {/* Live Status Pill with Real-time Away Ticker */}
                          <div className="shrink-0 text-right">
                            {isAway ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
                                AWAY ({liveAway}s)
                              </span>
                            ) : isSubmitted ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                                Submitted
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                Focused
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Telemetry Metrics Bar */}
                        <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-black/[0.03] text-center text-xs">
                          <div>
                            <span className="text-[10px] text-[#8E8C82] block">Switches</span>
                            <span className="font-bold text-[#1F1F1D]">{s.total_switches}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#8E8C82] block">Total Away</span>
                            <span className={`font-bold ${s.accumulated_away_seconds > 30 ? "text-rose-700" : "text-[#1F1F1D]"}`}>
                              {formatSeconds(s.accumulated_away_seconds)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#8E8C82] block">Risk Score</span>
                            <span
                              className={`font-extrabold ${
                                s.risk_score >= 60 || s.has_cheating_site
                                  ? "text-rose-700"
                                  : s.risk_score >= 30
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {s.risk_score}%
                            </span>
                          </div>
                        </div>

                        {/* Last Known URL or Application Target with Category Icon */}
                        {(() => {
                          const badge = getTargetBadge(s.last_target);
                          return (
                            <div className="space-y-1">
                              <div className="text-[11px] text-[#686760] bg-white/90 p-2 rounded-xl border border-black/10 space-y-1">
                                <div className="flex items-center justify-between gap-1 text-[10px]">
                                  <span className="text-[#8E8C82] font-semibold flex items-center gap-1">
                                    <span>{badge.icon}</span> {badge.label}
                                  </span>
                                  {isAway && s.last_departure_at && (
                                    <span className="text-rose-600 font-bold">
                                      Left: {new Date(s.last_departure_at).toLocaleTimeString()}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="font-mono text-[11px] truncate font-bold text-[#1F1F1D] bg-black/[0.03] p-1 rounded"
                                  title={s.last_target}
                                >
                                  {s.last_target || "Exam Canvas (Focused)"}
                                </div>
                              </div>

                              {/* Violation Chips */}
                              {((s.violation_tags && s.violation_tags.length > 0) || s.has_cheating_site || s.total_switches >= 3) && (
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  {s.has_cheating_site && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wide bg-rose-100 text-rose-800 border border-rose-300">
                                      ⚠ Cheating Site
                                    </span>
                                  )}
                                  {s.total_switches >= 3 && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                      ⚡ {s.total_switches} Switches
                                    </span>
                                  )}
                                  {s.accumulated_away_seconds >= 20 && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                      ⏳ &gt;20s Away
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Card Bottom Actions */}
                      <div
                        className="pt-2.5 mt-3 border-t border-black/[0.06] flex items-center justify-between gap-1 text-[11px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setTargetStudentWarn(s);
                            setTargetWarnText(`Warning: Tab switching and external applications are prohibited. Please focus on your exam.`);
                          }}
                          className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold transition"
                          title="Send targeted proctor warning to student screen"
                        >
                          📢 Warn
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedStudent(s)}
                          className="px-2 py-1 rounded bg-white hover:bg-black/5 text-[#1F1F1D] border border-black/10 font-bold transition"
                        >
                          📋 Audit
                        </button>

                        {s.attempt_id && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowManualGradeModal({
                                aid: s.attempt_id!,
                                studentName: s.student_name,
                              })
                            }
                            className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-bold transition"
                          >
                            🎯 Adjust
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= VIEW MODE 2: RAW ACTIVITY AUDIT STREAM ================= */}
        {viewMode === "stream" && (
          <div className="card p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
              <div>
                <h2 className="font-bold text-base text-[#1F1F1D]">Raw Audit Event Stream</h2>
                <p className="text-xs text-[#686760]">High-frequency real-time event ingestion log</p>
              </div>
              <button
                onClick={() => setEvents([])}
                className="text-xs text-[#686760] hover:text-black font-semibold"
              >
                Clear Log
              </button>
            </div>

            {events.length === 0 ? (
              <div className="p-10 text-center text-xs text-[#686760]">
                Waiting for student telemetry packets…
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto divide-y divide-black/[0.06] text-xs font-mono">
                {events.map((e, idx) => (
                  <div key={idx} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[#8E8C82] text-[11px] shrink-0">
                        {e.at ? new Date(e.at).toLocaleTimeString() : "—"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          e.severity === "CRITICAL"
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : e.severity === "HIGH"
                            ? "bg-orange-100 text-orange-800 border border-orange-200"
                            : e.event === "exam_submitted"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-black/[0.05] text-[#1F1F1D]"
                        }`}
                      >
                        {e.event_type || e.event}
                      </span>
                      <span className="font-sans font-medium text-[#1F1F1D]">
                        <strong>{e.student_name || "Student"}</strong>{" "}
                        {e.usn && <span className="text-[#8E8C82] text-xs">({e.usn})</span>}:{" "}
                        {e.duration_seconds ? (
                          <span className="font-bold text-rose-700">
                            Away for {e.duration_seconds}s
                          </span>
                        ) : e.focus_status === "AWAY" ? (
                          <span className="text-amber-700 font-bold">Left Exam Window</span>
                        ) : (
                          <span>Refocused on Exam</span>
                        )}
                        {e.target_app_or_url && e.target_app_or_url !== "—" && (
                          <span className="text-[#686760] ml-1">
                            • Target: <code className="text-xs font-bold text-blue-800">{e.target_app_or_url}</code>
                          </span>
                        )}
                      </span>
                    </div>

                    {e.attempt_id && (
                      <button
                        onClick={() =>
                          setShowManualGradeModal({
                            aid: e.attempt_id!,
                            studentName: e.student_name || "Student",
                          })
                        }
                        className="text-[11px] font-sans text-blue-700 font-semibold hover:underline shrink-0"
                      >
                        Adjust Score →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= MODAL: DETAILED STUDENT AUDIT DRAWER ================= */}
        {selectedStudent && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Drawer Header */}
              <div className="p-5 sm:p-6 border-b border-black/[0.08] flex items-start justify-between gap-3 bg-white">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-extrabold text-[#1F1F1D]">
                      {selectedStudent.student_name}
                    </h2>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-black/[0.05] rounded-md text-[#686760]">
                      {selectedStudent.usn}
                    </span>
                  </div>
                  <p className="text-xs text-[#686760] mt-1">
                    {selectedStudent.section} • Attempt Status:{" "}
                    <strong className="capitalize text-[#1F1F1D]">{selectedStudent.status}</strong>
                  </p>
                </div>

                <button
                  onClick={() => setSelectedStudent(null)}
                  className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-sm font-bold text-[#686760]"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Content */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
                {/* Risk Score Meter */}
                <div className="p-4 rounded-2xl bg-white border border-black/10 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-[#686760] uppercase tracking-wider">
                      Calculated Integrity Risk Score
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-[#1F1F1D]">
                        {selectedStudent.risk_score}%
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          selectedStudent.threat_level === "CRITICAL"
                            ? "bg-rose-100 text-rose-800"
                            : selectedStudent.threat_level === "HIGH"
                            ? "bg-orange-100 text-orange-800"
                            : selectedStudent.threat_level === "MEDIUM"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {selectedStudent.threat_level} Threat
                      </span>
                    </div>
                  </div>

                  <div className="w-full sm:w-48 bg-black/10 h-3 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedStudent.risk_score >= 60
                          ? "bg-rose-600"
                          : selectedStudent.risk_score >= 30
                          ? "bg-amber-500"
                          : "bg-emerald-600"
                      }`}
                      style={{ width: `${selectedStudent.risk_score}%` }}
                    />
                  </div>
                </div>

                {/* Metric breakdown summary */}
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="p-3 bg-white rounded-xl border border-black/5">
                    <span className="text-[#8E8C82] block text-[11px]">Total Focus Switches</span>
                    <span className="text-lg font-extrabold text-[#1F1F1D]">
                      {selectedStudent.total_switches}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-black/5">
                    <span className="text-[#8E8C82] block text-[11px]">Accumulated Time Away</span>
                    <span className="text-lg font-extrabold text-[#1F1F1D]">
                      {formatSeconds(selectedStudent.accumulated_away_seconds)}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-black/5">
                    <span className="text-[#8E8C82] block text-[11px]">Last Known Target</span>
                    <span className="text-xs font-mono font-bold text-blue-900 block truncate mt-1">
                      {selectedStudent.last_target}
                    </span>
                  </div>
                </div>

                {/* Chronological Excursion Timeline with Exact Opened & Closed Timestamps */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-[#1F1F1D]">
                      Detailed Excursion Log &amp; Tab-Tracking History
                    </h4>
                    <span className="text-xs font-semibold text-[#686760]">
                      {selectedStudent.recent_events.length} recorded excursions
                    </span>
                  </div>

                  {selectedStudent.recent_events.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#686760] bg-white rounded-2xl border border-black/5">
                      ✓ No suspicious window departures or external navigations logged.
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-black/10 overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-black/[0.03] border-b border-black/[0.08] text-[11px] font-bold text-[#686760] uppercase tracking-wider">
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3">Opened / Departed</th>
                              <th className="py-2.5 px-3">Closed / Returned</th>
                              <th className="py-2.5 px-3">Duration</th>
                              <th className="py-2.5 px-3">Target URL or Application</th>
                              <th className="py-2.5 px-3">Severity</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/[0.06]">
                            {selectedStudent.recent_events.map((ev, i) => {
                              const badge = getTargetBadge(ev.target || "", ev.target_category);
                              const isAwayEvent = ev.event_type?.includes("DEPART") || ev.status === "AWAY";
                              const openedStr = ev.opened_at ? new Date(ev.opened_at).toLocaleTimeString() : (ev.at ? new Date(ev.at).toLocaleTimeString() : "—");
                              const closedStr = ev.closed_at ? new Date(ev.closed_at).toLocaleTimeString() : (isAwayEvent ? "Still Away (Active)" : "Returned");

                              return (
                                <tr key={i} className="hover:bg-black/[0.015] transition">
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {isAwayEvent ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 w-max">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
                                        Away
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-max">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                        Returned
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-2.5 px-3 font-mono font-medium text-[#1F1F1D] whitespace-nowrap">
                                    {openedStr}
                                  </td>

                                  <td className="py-2.5 px-3 font-mono font-medium whitespace-nowrap">
                                    <span className={isAwayEvent && !ev.closed_at ? "text-rose-600 font-bold animate-pulse" : "text-[#1F1F1D]"}>
                                      {closedStr}
                                    </span>
                                  </td>

                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {ev.duration_seconds ? (
                                      <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                        {ev.duration_seconds}s
                                      </span>
                                    ) : (
                                      <span className="text-[#8E8C82]">—</span>
                                    )}
                                  </td>

                                  <td className="py-2.5 px-3 min-w-[200px] max-w-[280px]">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1 text-[10px]">
                                        <span>{badge.icon}</span>
                                        <span className="font-bold text-[#686760]">{badge.label}</span>
                                      </div>
                                      <div
                                        className="font-mono text-[11px] font-bold text-blue-900 truncate"
                                        title={ev.target || "—"}
                                      >
                                        {ev.target && ev.target !== "—" ? ev.target : "External Tab / Window"}
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        ev.severity === "CRITICAL"
                                          ? "bg-rose-100 text-rose-800 border border-rose-300"
                                          : ev.severity === "HIGH"
                                          ? "bg-orange-100 text-orange-800 border border-orange-200"
                                          : ev.severity === "MEDIUM"
                                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                                          : "bg-black/[0.04] text-[#686760]"
                                      }`}
                                    >
                                      {ev.severity || "LOW"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 sm:p-5 border-t border-black/[0.08] bg-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setTargetStudentWarn(selectedStudent);
                      setTargetWarnText(`Proctor Warning: Tab switching detected. Please focus on your exam window.`);
                    }}
                    className="btn-secondary text-xs px-3 py-2 text-amber-900 border-amber-300 bg-amber-50 hover:bg-amber-100"
                  >
                    📢 Send Targeted Warning
                  </button>

                  <button
                    onClick={() => pauseStudentMutation.mutate(selectedStudent.student_id)}
                    className="btn-danger text-xs px-3 py-2"
                  >
                    ⏸ Pause Student
                  </button>

                  <button
                    onClick={() => resumeStudentMutation.mutate(selectedStudent.student_id)}
                    className="btn-secondary text-xs px-3 py-2 text-emerald-800 border-emerald-300 hover:bg-emerald-50"
                  >
                    ▶ Resume Student
                  </button>
                </div>

                {selectedStudent.attempt_id && (
                  <button
                    onClick={() =>
                      setShowManualGradeModal({
                        aid: selectedStudent.attempt_id!,
                        studentName: selectedStudent.student_name,
                      })
                    }
                    className="btn-primary text-xs px-4 py-2"
                  >
                    🎯 Adjust Score / Penalty
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL: TARGETED WARNING ================= */}
        {targetStudentWarn && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div>
                <h3 className="font-bold text-sm text-[#1F1F1D]">
                  Issue Warning to {targetStudentWarn.student_name}
                </h3>
                <p className="text-xs text-[#686760] mt-0.5">
                  This notice will instantly freeze the student's screen until acknowledged.
                </p>
              </div>

              <textarea
                className="input resize-y min-h-[90px] text-xs bg-white"
                value={targetWarnText}
                onChange={(e) => setTargetWarnText(e.target.value)}
                placeholder="Type official warning message..."
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.08]">
                <button
                  onClick={() => setTargetStudentWarn(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    warnStudentMutation.mutate({
                      sid: targetStudentWarn.student_id,
                      msg: targetWarnText,
                    })
                  }
                  disabled={!targetWarnText.trim() || warnStudentMutation.isPending}
                  className="btn-primary bg-amber-700 hover:bg-amber-800 text-xs px-4"
                >
                  {warnStudentMutation.isPending ? "Sending…" : "Send Warning →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL: BROADCAST ANNOUNCEMENT ================= */}
        {showAnnounceModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <h3 className="font-bold text-sm text-[#1F1F1D]">Broadcast Notice to All Students</h3>
              <textarea
                className="input resize-y min-h-[90px] text-xs bg-white"
                placeholder="e.g. Please note correction on Question 4: assume standard pressure."
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
              />
              <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.08]">
                <button
                  onClick={() => setShowAnnounceModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => broadcastAnnouncement.mutate(announcementText)}
                  disabled={!announcementText.trim() || broadcastAnnouncement.isPending}
                  className="btn-primary text-xs"
                >
                  {broadcastAnnouncement.isPending ? "Broadcasting…" : "Broadcast Notice"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL: SCORE ADJUSTMENT ================= */}
        {showManualGradeModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#F8F7F2] border border-black/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <h3 className="font-bold text-sm text-[#1F1F1D]">
                Manual Score Adjustment — {showManualGradeModal.studentName}
              </h3>
              <p className="text-xs text-[#686760]">
                All adjustments require a mandatory reason and are logged in the institutional audit log.
              </p>
              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">New Total Score</label>
                <input
                  type="number"
                  step="0.5"
                  className="input text-xs bg-white"
                  value={manualScore}
                  onChange={(e) => setManualScore(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#1F1F1D] mb-1">Mandatory Justification / Reason</label>
                <textarea
                  className="input resize-y min-h-[70px] text-xs bg-white"
                  placeholder="e.g. Penalty deduction of -2 marks for repeated tab switching."
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.08]">
                <button
                  onClick={() => setShowManualGradeModal(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    manualGradeMutation.mutate({
                      aid: showManualGradeModal.aid,
                      score: manualScore,
                      reason: manualReason,
                    })
                  }
                  disabled={!manualReason.trim() || manualGradeMutation.isPending}
                  className="btn-primary text-xs"
                >
                  {manualGradeMutation.isPending ? "Applying…" : "Apply Adjustment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Regrade Impact Preview Overlay */}
        {regradePreviewData && (
          <div className="card p-5 border-blue-200 bg-white/95 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#1F1F1D]">Regrade Key Impact Preview</h3>
              <button
                onClick={() => setRegradePreviewData(null)}
                className="text-xs text-[#686760] hover:text-black"
              >
                ✕ Close
              </button>
            </div>
            <p className="text-xs text-[#686760]">
              Evaluated {regradePreviewData.diffs?.length || 0} submitted attempts against updated keys.
            </p>
            <div className="max-h-40 overflow-y-auto divide-y divide-black/[0.06] text-xs">
              {regradePreviewData.diffs?.map((d: any) => (
                <div key={d.attempt_id} className="py-2 flex items-center justify-between">
                  <span className="font-mono text-[#686760]">Attempt: {d.attempt_id.slice(0, 8)}...</span>
                  <div>
                    <span>Score: {d.current_score}</span> →{" "}
                    <strong className="text-emerald-700">{d.recalculated_score}</strong>{" "}
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
                onClick={() => commitRegrade.mutate()}
                disabled={commitRegrade.isPending}
                className="btn-primary text-xs bg-emerald-800 hover:bg-emerald-900"
              >
                {commitRegrade.isPending ? "Applying…" : "Confirm Regrade"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
