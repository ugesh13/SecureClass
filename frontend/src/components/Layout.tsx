import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ReactNode, useState } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (to: string) => {
    if (to === "/teacher/dashboard" || to === "/student/dashboard" || to === "/admin/dashboard") {
      return pathname === to;
    }
    return pathname.startsWith(to);
  };

  const navLink = (to: string, label: string) => (
    <Link
      key={to}
      to={to}
      onClick={() => setMobileMenuOpen(false)}
      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
        isActive(to)
          ? "bg-white text-[#1F1F1D] shadow-sm border border-black/10"
          : "text-[#686760] hover:text-[#1F1F1D] hover:bg-white/50"
      }`}
    >
      {label}
    </Link>
  );

  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F1E9] text-[#1F1F1D] font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Header Bar */}
      <header className="bg-[#F8F7F2] border-b border-black/[0.08] sticky top-0 z-40 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 font-extrabold text-lg tracking-tight text-[#1F1F1D]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#DE6B48]" />
              <span>SecureClass</span>
            </Link>

            {/* Desktop Role Navigation */}
            <nav className="hidden md:flex items-center gap-1 bg-black/[0.04] p-1 rounded-full border border-black/[0.06]">
              {isTeacher && (
                <>
                  {navLink("/teacher/dashboard", "Dashboard")}
                  {navLink("/teacher/questions", "Question Bank")}
                  {navLink("/teacher/exams", "Exams")}
                  {navLink("/teacher/results", "Results")}
                  {navLink("/teacher/settings", "Settings")}
                </>
              )}
              {isStudent && (
                <>
                  {navLink("/student/dashboard", "Dashboard")}
                  {navLink("/student/exams", "My Exams")}
                  {navLink("/student/results", "Results")}
                  {navLink("/student/profile", "Profile")}
                </>
              )}
              {isAdmin && (
                <>
                  {navLink("/admin/dashboard", "Admin Panel")}
                  {navLink("/teacher/dashboard", "Teacher View")}
                  {navLink("/teacher/questions", "Question Bank")}
                  {navLink("/teacher/exams", "Exams")}
                  {navLink("/teacher/results", "Results")}
                  {navLink("/teacher/settings", "Settings")}
                </>
              )}
            </nav>
          </div>

          {/* Right User Actions */}
          <div className="flex items-center gap-3 text-xs">
            {(isTeacher || isAdmin) && (
              <div className="hidden lg:flex items-center gap-2">
                <Link
                  to="/teacher/questions?create=true"
                  className="px-3 py-1.5 rounded-full font-semibold bg-white border border-black/10 hover:bg-black/5 text-[#1F1F1D] transition"
                >
                  + Create Question
                </Link>
                <Link
                  to="/teacher/exams/create"
                  className="px-3.5 py-1.5 rounded-full font-bold bg-[#1F1F1D] text-[#F3F1E9] hover:bg-black transition shadow-xs"
                >
                  + Create Exam
                </Link>
              </div>
            )}

            <div className="flex items-center gap-2 bg-white/70 px-3 py-1.5 rounded-full border border-black/[0.08]">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-[#1F1F1D] max-w-[120px] truncate">{user?.full_name}</span>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                isAdmin ? "text-amber-900 bg-amber-100" : "text-[#686760] bg-black/5"
              }`}>
                {user?.role === "super_admin" ? "admin" : user?.role}
              </span>
            </div>

            <button
              onClick={() => {
                logout();
                nav("/login");
              }}
              className="px-3 py-1.5 font-semibold text-[#686760] hover:text-[#1F1F1D] hover:bg-white/60 rounded-full transition"
            >
              Logout
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg bg-white/80 border border-black/10 text-[#1F1F1D]"
              aria-label="Toggle Navigation Menu"
            >
              <svg className="w-4 h-4 stroke-current stroke-2 fill-none" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-black/[0.08] bg-[#F8F7F2] p-4 flex flex-col gap-2">
            {isTeacher && (
              <>
                {navLink("/teacher/dashboard", "Dashboard")}
                {navLink("/teacher/questions", "Question Bank")}
                {navLink("/teacher/exams", "Exams")}
                {navLink("/teacher/results", "Results")}
                {navLink("/teacher/settings", "Settings")}
                <div className="pt-2 border-t border-black/[0.08] flex gap-2">
                  <Link
                    to="/teacher/questions?create=true"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2 rounded-xl text-xs font-semibold bg-white border border-black/10"
                  >
                    + Create Question
                  </Link>
                  <Link
                    to="/teacher/exams/create"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2 rounded-xl text-xs font-bold bg-[#1F1F1D] text-[#F3F1E9]"
                  >
                    + Create Exam
                  </Link>
                </div>
              </>
            )}
            {isStudent && (
              <>
                {navLink("/student/dashboard", "Dashboard")}
                {navLink("/student/exams", "My Exams")}
                {navLink("/student/results", "Results")}
                {navLink("/student/profile", "Profile")}
              </>
            )}
            {isAdmin && (
              <>
                {navLink("/admin/dashboard", "Admin Panel")}
                {navLink("/teacher/dashboard", "Teacher View")}
                {navLink("/teacher/questions", "Question Bank")}
                {navLink("/teacher/exams", "Exams")}
                {navLink("/teacher/results", "Results")}
                {navLink("/teacher/settings", "Settings")}
                <div className="pt-2 border-t border-black/[0.08] flex gap-2">
                  <Link
                    to="/teacher/questions?create=true"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2 rounded-xl text-xs font-semibold bg-white border border-black/10"
                  >
                    + Create Question
                  </Link>
                  <Link
                    to="/teacher/exams/create"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2 rounded-xl text-xs font-bold bg-[#1F1F1D] text-[#F3F1E9]"
                  >
                    + Create Exam
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {/* Main Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
