import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, wsBase } from "../lib/api";

type Question = {
  id: string;
  text: string;
  options: { text: string }[];
  marks: number;
  topic?: string;
  blooms_level?: string;
  difficulty?: string;
  is_cancelled?: boolean;
  explanation?: string;
  correct_displayed_index?: number;
};

export default function ExamTake() {
  const { token, attemptId } = useParams();
  const nav = useNavigate();
  const [attempt, setAttempt] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, number>>({});
  const [localConfidences, setLocalConfidences] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<string | null>(null);
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("normal");
  const integrityRef = useRef(0);
  const timerStartedRef = useRef(false);

  const parseUtcDate = (d: string | undefined | null) => {
    if (!d) return null;
    const str = String(d).trim();
    const normalized = str.endsWith("Z") || str.includes("+") ? str : `${str}Z`;
    const time = new Date(normalized).getTime();
    return isNaN(time) ? null : time;
  };

  // Join / load
  useEffect(() => {
    (async () => {
      try {
        let aid = attemptId;
        if (!aid && token) {
          const { data } = await api.post("/exams/join", { access_token: token });
          aid = data.attempt_id;
        }
        if (!aid) throw new Error("No attempt found");
        const { data } = await api.get(`/attempts/${aid}`);
        if (data.status === "pending_approval") {
          setError("Waiting for proctor approval to enter session…");
          return;
        }
        if (data.status === "rejected") {
          setError("Your join request was rejected by the proctor.");
          return;
        }
        setAttempt(data);
        // Restore answers — prefer server data, fall back to localStorage autosave
        const serverAnswers = data.answers || {};
        const serverConfs = data.confidences || {};
        const autosaveKey = `sc_autosave_${data.attempt_id || aid}`;
        const savedRaw = localStorage.getItem(autosaveKey);
        let restoredAnswers = serverAnswers;
        let restoredConfs = serverConfs;
        if (savedRaw && Object.keys(serverAnswers).length === 0) {
          try {
            const saved = JSON.parse(savedRaw);
            if (saved.answers && Object.keys(saved.answers).length > 0) {
              restoredAnswers = saved.answers;
              restoredConfs = saved.confidences || {};
              // Batch re-submit restored answers to server
              const batchList = Object.entries(saved.answers).map(([qid, displayedIdx]) => ({
                question_id: qid,
                displayed_index: displayedIdx,
                confidence_level: (saved.confidences || {})[qid] || "certain",
              }));
              api.post(`/attempts/${data.attempt_id || aid}/answers/batch`, { answers: batchList }).catch(() => {});
            }
          } catch {}
        }
        setLocalAnswers(restoredAnswers);
        setLocalConfidences(restoredConfs);
        setIsPaused(!!data.is_paused);
        if (data.accommodations?.high_contrast) setHighContrast(true);
        if (data.accommodations?.large_text) setFontSize("large");

        // Robust duration & time calculation
        const durMins = data.exam?.duration_minutes && data.exam.duration_minutes > 0 ? data.exam.duration_minutes : 30;
        let calculatedSecs = durMins * 60;
        if (typeof data.remaining_seconds === "number" && data.remaining_seconds > 0) {
          calculatedSecs = data.remaining_seconds;
        } else if (data.expires_at) {
          const expTime = parseUtcDate(data.expires_at);
          const nowTime = parseUtcDate(data.server_now) || Date.now();
          if (expTime && expTime > nowTime + 3000) {
            calculatedSecs = Math.floor((expTime - nowTime) / 1000);
          }
        }
        setSecondsLeft(calculatedSecs);
      } catch (e: any) {
        setError(e.response?.data?.detail || e.message || "Failed to load examination.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, attemptId]);

  // Autosave to localStorage on every answer/confidence change
  useEffect(() => {
    if (!attempt) return;
    const autosaveKey = `sc_autosave_${attempt.attempt_id}`;
    if (Object.keys(localAnswers).length > 0) {
      localStorage.setItem(autosaveKey, JSON.stringify({
        answers: localAnswers,
        confidences: localConfidences,
        savedAt: new Date().toISOString(),
      }));
    }
  }, [localAnswers, localConfidences, attempt]);

  // beforeunload — last-chance save to both localStorage and backend via sendBeacon
  useEffect(() => {
    const handler = () => {
      if (attempt && Object.keys(localAnswers).length > 0) {
        const autosaveKey = `sc_autosave_${attempt.attempt_id}`;
        localStorage.setItem(autosaveKey, JSON.stringify({
          answers: localAnswers,
          confidences: localConfidences,
          savedAt: new Date().toISOString(),
        }));

        try {
          const authTok = localStorage.getItem("sc_token");
          const payload = JSON.stringify({
            answers: Object.entries(localAnswers).map(([qid, displayedIdx]) => ({
              question_id: qid,
              displayed_index: displayedIdx,
              confidence_level: localConfidences[qid] || "certain",
            })),
          });
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(`/api/attempts/${attempt.attempt_id}/autosave`, blob);
        } catch {}
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [attempt, localAnswers, localConfidences]);

  const [targetedWarning, setTargetedWarning] = useState<string | null>(null);
  const [screenShared, setScreenShared] = useState(false);
  const [isDeparted, setIsDeparted] = useState(false);
  const departureTimeRef = useRef<number | null>(null);
  const lastTargetRef = useRef<string>("External Tab or Window");

  // Student Live WebSocket Connection (for Pause, Resume, Time Extensions, Announcements, Targeted Warnings)
  useEffect(() => {
    if (!attempt || attempt.status === "submitted") return;
    const authTok = localStorage.getItem("sc_token");
    if (!authTok) return;

    const url = `${wsBase()}/exams/${attempt.exam.id}/student/${attempt.attempt_id}?token=${authTok}`;
    const ws = new WebSocket(url);

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.event === "exam_paused" || (data.event === "student_paused" && data.student_id === attempt.student_id)) {
          setIsPaused(true);
        } else if (data.event === "exam_resumed" || (data.event === "student_resumed" && data.student_id === attempt.student_id)) {
          setIsPaused(false);
          if (data.compensated_seconds) {
            setSecondsLeft((s) => (s !== null ? s + data.compensated_seconds : data.compensated_seconds));
          }
        } else if (data.event === "targeted_warning" && data.student_id === attempt.student_id) {
          setTargetedWarning(data.warning);
        } else if (data.event === "time_extended") {
          const extraSecs = (data.extra_minutes || 5) * 60;
          setSecondsLeft((s) => (s !== null ? s + extraSecs : extraSecs));
          setActiveAnnouncement(`Teacher extended exam time by +${data.extra_minutes} minutes.`);
        } else if (data.event === "emergency_announcement") {
          setActiveAnnouncement(data.announcement);
        }
      } catch {}
    };

    return () => ws.close();
  }, [attempt]);

  // Screen proctor stream trigger
  const startScreenProctor = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      setScreenShared(true);
      const track = stream.getVideoTracks()[0];
      if (track) {
        lastTargetRef.current = `Screen Shared: ${track.label || "Display Monitor"}`;
        track.onended = () => {
          setScreenShared(false);
          if (attempt) {
            api.post(`/attempts/${attempt.attempt_id}/events`, {
              event_type: "SCREEN_PROCTOR_DISCONNECTED",
              metadata: { severity: "HIGH" },
            }).catch(() => {});
          }
          setWarning("Screen proctor stream disconnected. Activity recorded.");
        };
      }
    } catch {
      // Permission rejected
    }
  };

  // Timer Countdown - Guaranteed safe against premature submission
  useEffect(() => {
    if (loading || !attempt || isPaused || attempt.status !== "in_progress" || secondsLeft === null) return;

    timerStartedRef.current = true;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s === null) return null;
        if (s <= 1) {
          clearInterval(t);
          submit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [loading, attempt?.status, isPaused, attempt?.attempt_id, secondsLeft === null]);

  const [extConnected, setExtConnected] = useState(false);

  // Comprehensive Integrity Monitoring (Paired Departure/Return Engine + Heuristics)
  useEffect(() => {
    if (!attempt || attempt.exam.security_mode === "practice" || attempt.status === "submitted") return;
    const aid = attempt.attempt_id;
    const record = (type: string, meta: any = {}) => {
      api.post(`/attempts/${aid}/events`, { event_type: type, metadata: meta }).catch(() => {});
      integrityRef.current += 1;
    };

    // Ping companion extension if installed
    window.postMessage({ type: "SECURECLASS_PAGE_PING" }, "*");

    const handleDeparture = (reason: string, targetOverride?: string) => {
      if (departureTimeRef.current !== null) return;
      const now = Date.now();
      departureTimeRef.current = now;
      setIsDeparted(true);
      if (targetOverride) lastTargetRef.current = targetOverride;

      record("STUDENT_DEPARTED", {
        status: "AWAY",
        opened_at: new Date(now).toISOString(),
        departure_timestamp: new Date(now).toISOString(),
        reason,
        target_app_or_url: lastTargetRef.current,
      });
    };

    const handleReturn = (reason: string, overrideDuration?: number, overrideTarget?: string) => {
      if (departureTimeRef.current === null && (!overrideDuration || overrideDuration <= 0)) return;
      const returnTime = Date.now();
      const departureTime = departureTimeRef.current || (returnTime - (overrideDuration ? overrideDuration * 1000 : 1000));
      const dur = overrideDuration && overrideDuration > 0
        ? overrideDuration
        : Math.max(0.2, Math.round(((returnTime - departureTime) / 1000) * 10) / 10);

      const openedAtIso = new Date(departureTime).toISOString();
      const closedAtIso = new Date(returnTime).toISOString();

      departureTimeRef.current = null;
      setIsDeparted(false);
      const target = overrideTarget || lastTargetRef.current;

      let severity = "LOW";
      if (dur >= 20) severity = "HIGH";
      else if (dur >= 5) severity = "MEDIUM";

      record("STUDENT_RETURNED", {
        status: "FOCUSED",
        opened_at: openedAtIso,
        closed_at: closedAtIso,
        return_timestamp: closedAtIso,
        duration_seconds: dur,
        reason,
        severity,
        target_app_or_url: target,
      });

      // Avoid false positive spam for micro-glitches < 0.8s
      if (dur >= 0.8) {
        setWarning(`Focus lost for ${dur}s to "${target}". This activity is recorded in your exam audit report.`);
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") handleDeparture("TAB_SWITCH_OR_MINIMIZE");
      else handleReturn("TAB_RETURN");
    };

    const onBlur = () => handleDeparture("WINDOW_FOCUS_LOST");
    const onFocus = () => handleReturn("WINDOW_FOCUS_REGAINED");

    const onFs = () => {
      if (!document.fullscreenElement) {
        record("FULLSCREEN_EXIT", { severity: "HIGH" });
        setWarning("Fullscreen exited. This activity has been recorded in the session audit.");
      } else {
        record("FULLSCREEN_ENTER");
      }
    };

    const onCopy = () => record("COPY_ATTEMPT");
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") || "";
      record("PASTE_ATTEMPT", {
        pasted_length: text.length,
        pasted_sample: text.slice(0, 30) + (text.length > 30 ? "..." : ""),
        severity: text.length > 40 ? "HIGH" : "MEDIUM",
      });
      setWarning("Pasting content from external sources is flagged in your audit report.");
    };

    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      record("CONTEXT_MENU_ATTEMPT");
    };

    // Keystroke shortcut interception (Tab creation, task switching, devtools)
    const onKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        lastTargetRef.current = "New Browser Tab (Ctrl+T)";
        record("SHORTCUT_NEW_TAB", {
          target_app_or_url: "New Browser Tab (Blocked / Attempted)",
          severity: "HIGH",
        });
        setWarning("Opening new browser tabs is strictly prohibited during the exam.");
      } else if (isCtrlOrCmd && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        lastTargetRef.current = "New Browser Window (Ctrl+N)";
        record("SHORTCUT_NEW_TAB", {
          target_app_or_url: "New Browser Window (Blocked / Attempted)",
          severity: "HIGH",
        });
        setWarning("Opening new browser windows is strictly prohibited.");
      } else if (e.key === "F12" || (isCtrlOrCmd && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c"))) {
        e.preventDefault();
        record("DEVTOOLS_ATTEMPT", { severity: "CRITICAL" });
        setWarning("Inspecting page source or opening Developer Tools is a severe honor violation.");
      } else if (e.altKey && e.key === "Tab") {
        lastTargetRef.current = "OS Task Switcher (Alt+Tab)";
      }
    };

    // Companion extension message listener for exact URLs, tab actions, and desktop applications
    const onExtMsg = (ev: MessageEvent) => {
      if (!ev.data) return;

      if (ev.data.type === "SECURECLASS_EXT_READY" || ev.data.action === "HEARTBEAT" || ev.data.type === "SECURECLASS_EXT_PONG") {
        setExtConnected(true);
      }

      if (ev.data.type === "SECURECLASS_TELEMETRY" || ev.data.type === "SECURECLASS_EXT_TELEMETRY") {
        const action = ev.data.action;
        const target = ev.data.target_url || ev.data.title || ev.data.app_name;

        if (action === "TAB_CREATED") {
          lastTargetRef.current = target || "New Browser Tab";
          handleDeparture("TAB_CREATED", lastTargetRef.current);
          record("TAB_CREATED", {
            status: "AWAY",
            target_app_or_url: lastTargetRef.current,
            title: ev.data.title,
            opened_at: ev.data.opened_at || new Date().toISOString(),
            severity: "HIGH",
          });
        } else if (action === "EXTERNAL_TAB_SWITCH") {
          lastTargetRef.current = target || "External Tab";
          handleDeparture("EXTERNAL_TAB_SWITCH", lastTargetRef.current);
        } else if (action === "EXTERNAL_NAVIGATION") {
          lastTargetRef.current = target || "External Website";
          handleDeparture("EXTERNAL_NAVIGATION", lastTargetRef.current);
          record("EXTERNAL_NAVIGATION", {
            status: "AWAY",
            target_app_or_url: target,
            title: ev.data.title,
            opened_at: ev.data.opened_at || new Date().toISOString(),
            severity: "HIGH",
          });
        } else if (action === "NON_BROWSER_APP_SWITCH") {
          lastTargetRef.current = target || "External Desktop Application (Outside Browser)";
          handleDeparture("NON_BROWSER_APP_SWITCH", lastTargetRef.current);
          record("NON_BROWSER_APP_SWITCH", {
            status: "AWAY",
            target_app_or_url: lastTargetRef.current,
            title: ev.data.title || "External Desktop Application",
            opened_at: ev.data.opened_at || new Date().toISOString(),
            severity: "HIGH",
          });
        } else if (action === "EXAM_TAB_FOCUSED") {
          handleReturn("EXAM_TAB_RETURNED", ev.data.duration_seconds, ev.data.last_target);
        } else if (target) {
          lastTargetRef.current = target;
          if (departureTimeRef.current !== null) {
            record("EXTERNAL_NAVIGATION", {
              status: "AWAY",
              target_app_or_url: target,
              title: ev.data.title,
              action: action || "EXTERNAL_TAB_ACTIVE",
            });
          }
        }
      }
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onExtMsg);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onExtMsg);
    };
  }, [attempt]);

  const select = async (qid: string, displayed: number, confidence?: string) => {
    if (isPaused) {
      alert("Exam is currently paused by the proctor. Answers cannot be submitted right now.");
      return;
    }
    const conf = confidence || localConfidences[qid] || "certain";
    setLocalAnswers((a) => ({ ...a, [qid]: displayed }));
    setLocalConfidences((c) => ({ ...c, [qid]: conf }));
    setSaveStatus("saving");

    try {
      await api.post(`/attempts/${attempt.attempt_id}/answers`, {
        question_id: qid,
        displayed_index: displayed,
        confidence_level: conf,
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("offline");
    }
  };

  const submit = async (auto = false) => {
    if (!attempt) return;
    if (!auto && !confirm("Submit exam? You cannot modify your answers after submission.")) return;
    try {
      await api.post(`/attempts/${attempt.attempt_id}/submit`);
      // Clear autosave on successful submission
      localStorage.removeItem(`sc_autosave_${attempt.attempt_id}`);
      // Reload attempt to view comprehensive feedback
      const refreshed = await api.get(`/attempts/${attempt.attempt_id}`);
      setAttempt(refreshed.data);
    } catch (e: any) {
      alert(e.response?.data?.detail || "Submission failed");
    }
  };

  const formatTime = (s: number | null) => {
    if (s === null || s === undefined) return "--:--";
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  const handleRetake = async () => {
    if (!attempt) return;
    if (!confirm("Reset and restart this exam session? You can answer all questions fresh.")) return;
    try {
      setLoading(true);
      await api.post(`/attempts/${attempt.attempt_id}/reset`);
      const { data } = await api.get(`/attempts/${attempt.attempt_id}`);
      const durMins = data.exam?.duration_minutes && data.exam.duration_minutes > 0 ? data.exam.duration_minutes : 30;
      setSecondsLeft((data.remaining_seconds && data.remaining_seconds > 0) ? data.remaining_seconds : durMins * 60);
      setAttempt(data);
      setLocalAnswers({});
      setLocalConfidences({});
      setIdx(0);
    } catch (e: any) {
      alert(e.response?.data?.detail || "Could not reset attempt");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-[#686760] text-sm">Connecting to secure exam session…</div>;
  if (error) return (
    <div className="min-h-screen bg-[#F3F1E9] flex items-center justify-center p-4">
      <div className="p-8 max-w-lg mx-auto card text-center text-red-700 font-semibold text-sm">
        {error}
      </div>
    </div>
  );
  if (!attempt) return null;

  const currentQ: Question = attempt.questions[idx];
  const isSubmitted = attempt.status === "submitted";

  const fontClass =
    fontSize === "xlarge" ? "text-lg" : fontSize === "large" ? "text-base" : "text-sm";

  return (
    <div className={`min-h-screen font-['Inter',sans-serif] transition-colors ${highContrast ? "bg-slate-950 text-slate-50" : "bg-[#F3F1E9] text-[#1F1F1D]"}`}>
      {/* Header Bar */}
      <header className={`px-4 sm:px-6 py-3 border-b flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 ${highContrast ? "bg-slate-900 border-slate-800" : "bg-[#F8F7F2] border-black/[0.08]"}`}>
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-base tracking-tight">SecureClass</span>
          <span className="text-xs text-[#686760]">| {attempt.exam.title}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Proctor Companion Protection Status */}
          <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border border-black/10 bg-white/70 shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${extConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
            <span className={extConnected ? "text-emerald-900" : "text-amber-900"}>
              {extConnected ? "Companion Active" : "Web Shield"}
            </span>
          </div>

          {/* Accommodations controls */}
          <div className="flex items-center gap-1 text-xs border border-black/10 rounded-full p-1 bg-white/60">
            <button
              onClick={() => setHighContrast(!highContrast)}
              className={`px-2.5 py-1 rounded-full font-medium transition ${highContrast ? "bg-amber-400 text-slate-950" : "text-[#686760] hover:text-[#1F1F1D]"}`}
              title="Toggle High-Contrast Accessibility Mode"
            >
              {highContrast ? "Standard" : "High Contrast"}
            </button>
            <button
              onClick={() => setFontSize(fontSize === "normal" ? "large" : fontSize === "large" ? "xlarge" : "normal")}
              className="px-2.5 py-1 rounded-full font-medium text-[#686760] hover:text-[#1F1F1D]"
              title="Cycle font scale"
            >
              Font: {fontSize === "normal" ? "1x" : fontSize === "large" ? "1.2x" : "1.4x"}
            </button>
          </div>

          {!isSubmitted && (
            <div className={`px-3 py-1.5 rounded-full font-mono font-bold text-xs ${secondsLeft !== null && secondsLeft < 300 ? "bg-rose-100 text-rose-800 animate-pulse border border-rose-200" : highContrast ? "bg-slate-800 text-emerald-400" : "bg-black/5 text-[#1F1F1D]"}`}>
              ⏱ {isPaused ? "PAUSED" : formatTime(secondsLeft)}
            </div>
          )}

          {!isSubmitted && (
            <button onClick={() => submit(false)} className="btn-primary text-xs py-1.5 px-4 shadow-xs">
              Submit Exam
            </button>
          )}
        </div>
      </header>

      {/* Emergency Announcement Banner */}
      {activeAnnouncement && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 font-semibold text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span>📢</span>
            <span><strong>Notice:</strong> {activeAnnouncement}</span>
          </div>
          <button onClick={() => setActiveAnnouncement(null)} className="font-bold text-sm px-2">
            ✕
          </button>
        </div>
      )}

      {/* Emergency Classroom Paused Overlay */}
      {isPaused && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 text-center">
          <div className="bg-[#F8F7F2] text-[#1F1F1D] max-w-md w-full p-8 rounded-3xl shadow-2xl border border-black/15 space-y-4">
            <div className="text-4xl">⏸</div>
            <h2 className="text-2xl font-bold">Exam Temporarily Paused</h2>
            <p className="text-xs text-[#686760] leading-relaxed">
              The teacher has paused this session for classroom moderation. Your timer is frozen and will be compensated once the session resumes.
            </p>
            <div className="text-xs font-semibold text-indigo-700 animate-pulse">
              Please wait quietly. Do not refresh or leave the tab.
            </div>
          </div>
        </div>
      )}

      {/* ================= POST-SUBMISSION FEEDBACK CENTER ================= */}
      {isSubmitted ? (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
          <div className={`card p-6 sm:p-8 text-center ${highContrast ? "bg-slate-900 border-slate-800" : "bg-white/80"}`}>
            <span className="badge bg-emerald-100 text-emerald-800 uppercase font-bold text-xs border-emerald-200">
              Exam Submitted
            </span>
            <h2 className="text-3xl font-extrabold mt-3 text-[#1F1F1D]">
              Score: {attempt.score} / {attempt.exam.total_marks} pts
            </h2>
            <p className="text-xs text-[#686760] mt-1">
              Submitted at {new Date(attempt.server_now).toLocaleTimeString()}. Review solution explanations below.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={handleRetake}
                className="btn-primary text-xs py-2 px-5 shadow-xs"
              >
                🔄 Retake / Restart Exam
              </button>
              <button
                onClick={() => nav("/student/exams")}
                className="btn-secondary text-xs py-2 px-5"
              >
                ← Back to My Exams
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-base text-[#1F1F1D]">Question Review & Feedback</h3>
            {attempt.questions.map((q: Question, i: number) => {
              const selectedOriginalIdx = attempt.answers[q.id];
              return (
                <div key={q.id} className={`card p-5 space-y-3 ${highContrast ? "bg-slate-900 border-slate-800" : "bg-white/70 border-black/10"}`}>
                  <div className="flex items-center justify-between text-xs text-[#686760]">
                    <span>Question {i + 1} of {attempt.questions.length} • {q.topic || "General"}</span>
                    <span className="badge text-[11px] capitalize">{q.blooms_level || "understand"}</span>
                  </div>
                  <h4 className={`font-semibold ${fontClass} text-[#1F1F1D]`}>{q.text}</h4>

                  {q.is_cancelled && (
                    <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-medium rounded-xl border border-emerald-200">
                      Question cancelled by instructor — Full grace marks awarded.
                    </div>
                  )}

                  <div className="space-y-2 text-xs">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = q.correct_displayed_index === optIdx;
                      return (
                        <div
                          key={optIdx}
                          className={`p-3 rounded-xl border flex items-center justify-between ${
                            isCorrect
                              ? "border-emerald-300 bg-emerald-50 text-emerald-950 font-medium"
                              : "border-black/10 bg-white"
                          }`}
                        >
                          <div>
                            <span className="font-bold mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                            <span>{opt.text}</span>
                          </div>
                          {isCorrect && <span className="text-emerald-700 font-bold">✓ Correct Answer</span>}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900">
                      <strong>Solution Note:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-center pt-4">
            <button onClick={() => nav("/student/dashboard")} className="btn-primary text-xs px-6 py-2.5 shadow-sm">
              Return to Student Dashboard
            </button>
          </div>
        </div>
      ) : (
        <main className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
          {/* Targeted Proctor Warning Modal */}
          {targetedWarning && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[#F8F7F2] border-2 border-red-500 rounded-3xl max-w-md w-full p-6 sm:p-8 text-center shadow-2xl space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto text-2xl font-bold">
                  ⚠️
                </div>
                <h3 className="text-xl font-extrabold text-[#1F1F1D]">Official Proctor Warning</h3>
                <div className="text-xs sm:text-sm text-red-800 bg-red-50 p-4 rounded-xl border border-red-200 leading-relaxed font-medium">
                  {targetedWarning}
                </div>
                <p className="text-[11px] text-[#686760]">
                  All departures from this window, tab switches, and background apps are actively logged.
                </p>
                <button
                  onClick={() => setTargetedWarning(null)}
                  className="btn-primary w-full py-2.5 text-xs bg-red-700 hover:bg-red-800 text-white font-bold"
                >
                  I Acknowledge & Return to Exam
                </button>
              </div>
            </div>
          )}

          {/* Persistent Proctor Security Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-black/[0.03] border border-black/10 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isDeparted ? "bg-amber-500 animate-ping" : "bg-emerald-500"}`} />
              <span className="font-bold text-[#1F1F1D]">
                {isDeparted ? "⚠️ Proctor Alert: Exam Window Inactive" : "🛡️ Proctor Guard Active"}
              </span>
              <span className="text-[#686760] hidden sm:inline">• Tab switches and absences are recorded</span>
            </div>
            <div className="flex items-center gap-2">
              {screenShared ? (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold text-[11px] border border-emerald-200">
                  ✓ Screen Stream Linked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={startScreenProctor}
                  className="px-2.5 py-1 rounded-lg bg-white border border-black/10 text-[11px] font-bold text-[#1F1F1D] hover:bg-black/5 transition"
                >
                  🖥️ Enable Screen Guard
                </button>
              )}
            </div>
          </div>

          {warning && (
            <div className="bg-amber-100 text-amber-900 p-3 rounded-xl text-xs flex justify-between items-center border border-amber-200">
              <span>⚠️ {warning}</span>
              <button onClick={() => setWarning(null)} className="font-bold text-sm">✕</button>
            </div>
          )}

          {/* Question Stepper */}
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {attempt.questions.map((q: Question, i: number) => {
              const answered = localAnswers[q.id] !== undefined;
              return (
                <button
                  key={q.id}
                  onClick={() => setIdx(i)}
                  className={`w-8 h-8 rounded-lg font-bold text-xs shrink-0 transition ${
                    idx === i
                      ? "bg-[#1F1F1D] text-white shadow-xs"
                      : answered
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : highContrast
                      ? "bg-slate-800 text-slate-300"
                      : "bg-white text-[#686760] border border-black/10"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Current Question */}
          {currentQ && (
            <div className={`card p-6 sm:p-8 space-y-6 ${highContrast ? "bg-slate-900 border-slate-800" : "bg-white/80 border-black/10 shadow-xs"}`}>
              <div className="flex items-center justify-between text-xs text-[#686760]">
                <span className="font-semibold">Question {idx + 1} of {attempt.questions.length}</span>
                <span className="badge font-bold">{currentQ.marks} pt{currentQ.marks !== 1 ? "s" : ""}</span>
              </div>

              <h2 className={`font-bold ${fontClass} leading-relaxed text-[#1F1F1D]`}>
                {currentQ.text}
              </h2>

              {/* Options */}
              <div className="space-y-2.5">
                {currentQ.options.map((opt, optIdx) => {
                  const isSelected = localAnswers[currentQ.id] === optIdx;
                  return (
                    <button
                      key={optIdx}
                      onClick={() => select(currentQ.id, optIdx)}
                      className={`w-full text-left p-3.5 rounded-xl border transition flex items-center gap-3 ${fontClass} ${
                        isSelected
                          ? "border-[#1F1F1D] bg-white ring-1 ring-[#1F1F1D] font-medium text-[#1F1F1D]"
                          : highContrast
                          ? "border-slate-800 hover:bg-slate-800/50"
                          : "border-black/10 bg-white/60 hover:bg-white text-[#1F1F1D]"
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isSelected ? "bg-[#1F1F1D] text-white" : "bg-black/5 text-[#686760]"
                      }`}>
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="flex-1">{opt.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Confidence-Based Tagging */}
              <div className="pt-4 border-t border-black/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-[#686760] font-medium">Confidence in answer:</span>
                <div className="flex gap-1.5">
                  {["certain", "unsure", "guessing"].map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        if (localAnswers[currentQ.id] !== undefined) {
                          select(currentQ.id, localAnswers[currentQ.id], c);
                        }
                      }}
                      className={`px-3 py-1 rounded-full capitalize font-semibold transition text-xs ${
                        localConfidences[currentQ.id] === c
                          ? "bg-[#1F1F1D] text-white"
                          : "bg-black/5 text-[#686760] hover:bg-black/10"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between items-center pt-4 border-t border-black/[0.08]">
                <button
                  disabled={idx === 0}
                  onClick={() => setIdx(idx - 1)}
                  className="btn-secondary text-xs px-4 disabled:opacity-30"
                >
                  ← Previous
                </button>
                <span className="text-xs text-[#686760]">
                  {saveStatus === "saving" ? "Autosaving…" : saveStatus === "saved" ? "✓ Answer saved" : ""}
                </span>
                <button
                  disabled={idx === attempt.questions.length - 1}
                  onClick={() => setIdx(idx + 1)}
                  className="btn-primary text-xs px-5 disabled:opacity-30 shadow-xs"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
