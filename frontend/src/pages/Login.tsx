import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getApiErrorMessage } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const u = await login(email, password);
      nav(u.role === "student" ? "/student/dashboard" : u.role === "admin" || u.role === "super_admin" ? "/admin/dashboard" : "/teacher/dashboard");
    } catch (e: any) {
      setErr(getApiErrorMessage(e, "Invalid email or password. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F1E9] text-[#1F1F1D] flex items-center justify-center p-4 font-['Inter',sans-serif]">
      <div className="card p-8 sm:p-10 w-full max-w-md bg-[#F8F7F2]/90 border border-black/10 rounded-3xl shadow-sm">
        <Link to="/" className="inline-flex items-center gap-2 font-extrabold text-lg text-[#1F1F1D]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1F1F1D]" />
          <span>SecureClass</span>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight mt-6">
          Sign In
        </h1>
        <p className="text-[#686760] text-xs sm:text-sm mt-1">
          Access your examinations, question bank, and results.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#1F1F1D] mb-1.5">Email Address</label>
            <input
              className="input"
              type="email"
              placeholder="you@institution.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1F1F1D] mb-1.5">Password</label>
            <div className="relative flex items-center">
              <input
                className="input pr-12 w-full"
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#686760] hover:text-[#1F1F1D] hover:bg-black/5 active:bg-black/10 transition cursor-pointer z-10 flex items-center justify-center"
                aria-label={showPw ? "Hide password" : "Show password"}
                title={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5 text-[#1F1F1D]"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5 text-[#686760]"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {err && (
            <div className="text-xs font-semibold text-red-700 bg-red-50 p-3 rounded-xl border border-red-200">
              {err}
            </div>
          )}

          <button
            className="btn-primary w-full py-2.5 mt-2 text-xs font-bold uppercase tracking-wider"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <p className="text-xs text-[#686760] mt-6 text-center">
          Need a teacher account?{" "}
          <Link to="/register" className="text-[#1F1F1D] font-bold underline hover:text-black">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
