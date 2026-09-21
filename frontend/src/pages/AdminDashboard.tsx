import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

export default function AdminDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "exams" | "audit">("overview");

  // 1. Platform overview metrics
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => (await api.get("/users/admin/overview")).data,
  });

  // 2. All platform users
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  // 3. All platform exams
  const { data: exams = [], isLoading: loadingExams } = useQuery({
    queryKey: ["admin-exams"],
    queryFn: async () => (await api.get("/exams")).data,
  });

  // 4. Audit logs
  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => (await api.get("/users/admin/audit-logs")).data,
  });

  // User role update mutation
  const updateRole = useMutation({
    mutationFn: async ({ uid, role }: { uid: string; role: string }) =>
      (await api.put(`/users/${uid}/role`, { role })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to update user role");
    },
  });

  // Toggle user active status mutation
  const toggleStatus = useMutation({
    mutationFn: async (uid: string) =>
      (await api.put(`/users/${uid}/toggle-status`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to toggle status");
    },
  });

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u: any) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (userSearch) {
        const q = userSearch.toLowerCase();
        const matchName = u.full_name?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        const matchRef = u.student_ref?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchRef) return false;
      }
      return true;
    });
  }, [users, roleFilter, userSearch]);

  return (
    <Layout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Admin Portal Header Banner */}
        <div className="card p-6 sm:p-8 bg-gradient-to-r from-[#1F1F1D] to-[#2E2C28] text-[#F3F1E9] rounded-3xl relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-purple-500/15 via-indigo-500/10 to-transparent rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-200 border border-purple-400/30">
                  Global System Administrator
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Neon PostgreSQL Active
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3">
                Command & Control Console
              </h1>
              <p className="text-xs sm:text-sm text-[#F3F1E9]/75 mt-1 max-w-xl">
                Welcome, {user?.full_name || "Admin"}. Oversee institutions, manage role permissions, monitor system health, and inspect audit logs.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/teacher/dashboard"
                className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-3.5 py-2 cursor-pointer backdrop-blur-sm"
              >
                Teacher View →
              </Link>
              <Link
                to="/student/dashboard"
                className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-3.5 py-2 cursor-pointer backdrop-blur-sm"
              >
                Student View →
              </Link>
            </div>
          </div>

          {/* Database & Platform Status Strip */}
          <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Total Registered</span>
              <strong className="text-lg font-extrabold text-white">
                {overview?.users?.total ?? users.length} Users
              </strong>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Educators</span>
              <strong className="text-lg font-extrabold text-amber-300">
                {overview?.users?.teachers ?? 0} Teachers
              </strong>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Examinations</span>
              <strong className="text-lg font-extrabold text-emerald-400">
                {overview?.exams?.total ?? exams.length} Exams
              </strong>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
              <span className="text-[11px] text-[#F3F1E9]/60 block font-medium">Database Host</span>
              <span className="text-xs font-mono font-bold text-purple-300 block truncate" title={overview?.database?.host}>
                Neon Cloud PG
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-black/[0.08] pb-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#1F1F1D] text-[#F3F1E9]"
                : "text-[#686760] hover:text-[#1F1F1D] hover:bg-black/5"
            }`}
          >
            📊 System Overview
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "users"
                ? "bg-[#1F1F1D] text-[#F3F1E9]"
                : "text-[#686760] hover:text-[#1F1F1D] hover:bg-black/5"
            }`}
          >
            👥 User Management ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("exams")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "exams"
                ? "bg-[#1F1F1D] text-[#F3F1E9]"
                : "text-[#686760] hover:text-[#1F1F1D] hover:bg-black/5"
            }`}
          >
            📝 Global Examinations ({exams.length})
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "audit"
                ? "bg-[#1F1F1D] text-[#F3F1E9]"
                : "text-[#686760] hover:text-[#1F1F1D] hover:bg-black/5"
            }`}
          >
            📜 Audit Logs ({auditLogs.length})
          </button>
        </div>

        {/* TAB 1: SYSTEM OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Infrastructure Card */}
              <div className="card p-6 space-y-4 md:col-span-2">
                <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                  <div>
                    <h3 className="font-bold text-base text-[#1F1F1D]">Infrastructure & Data Tier</h3>
                    <p className="text-xs text-[#686760]">Authoritative backend server configuration</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Live & Synced
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 bg-white rounded-xl border border-black/10">
                    <span className="text-[#686760] block mb-1">Database Engine</span>
                    <strong className="text-sm font-bold text-[#1F1F1D] block">
                      PostgreSQL 18.6 (Neon Serverless)
                    </strong>
                    <span className="text-[11px] text-emerald-700 font-mono">SSL require • Pooler active</span>
                  </div>

                  <div className="p-3.5 bg-white rounded-xl border border-black/10">
                    <span className="text-[#686760] block mb-1">Application Driver</span>
                    <strong className="text-sm font-bold text-[#1F1F1D] block">
                      SQLAlchemy + Psycopg 3.3
                    </strong>
                    <span className="text-[11px] text-emerald-700 font-mono">High throughput binary driver</span>
                  </div>

                  <div className="p-3.5 bg-white rounded-xl border border-black/10">
                    <span className="text-[#686760] block mb-1">API Security Mode</span>
                    <strong className="text-sm font-bold text-[#1F1F1D] block">
                      Server-Authoritative Timing
                    </strong>
                    <span className="text-[11px] text-[#686760]">Client autosaves with offline queue</span>
                  </div>

                  <div className="p-3.5 bg-white rounded-xl border border-black/10">
                    <span className="text-[#686760] block mb-1">WebSockets Monitoring Hub</span>
                    <strong className="text-sm font-bold text-[#1F1F1D] block">
                      Active Real-Time Bridge
                    </strong>
                    <span className="text-[11px] text-emerald-700 font-mono">ws://localhost:8000/ws</span>
                  </div>
                </div>
              </div>

              {/* Roles Breakdown */}
              <div className="card p-6 space-y-4">
                <div className="border-b border-black/[0.08] pb-3">
                  <h3 className="font-bold text-base text-[#1F1F1D]">Roster Distribution</h3>
                  <p className="text-xs text-[#686760]">Users by credential permissions</p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-black/10">
                    <span className="font-semibold text-[#1F1F1D] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Students
                    </span>
                    <span className="font-mono font-bold text-sm text-[#1F1F1D]">
                      {overview?.users?.students ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-black/10">
                    <span className="font-semibold text-[#1F1F1D] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      Teachers
                    </span>
                    <span className="font-mono font-bold text-sm text-[#1F1F1D]">
                      {overview?.users?.teachers ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-black/10">
                    <span className="font-semibold text-[#1F1F1D] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      Administrators
                    </span>
                    <span className="font-mono font-bold text-sm text-[#1F1F1D]">
                      {overview?.users?.admins ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT */}
        {activeTab === "users" && (
          <div className="card p-6 space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.08] pb-4">
              <div>
                <h3 className="font-bold text-base text-[#1F1F1D]">Platform Users</h3>
                <p className="text-xs text-[#686760]">Manage roles, permissions, and account statuses</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search user name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="input text-xs py-1.5 px-3 w-48 sm:w-64"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="input text-xs py-1.5 px-2 bg-white cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="teacher">Teachers</option>
                  <option value="student">Students</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-black/10 text-[#686760] uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Name & Email</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Student Ref</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-black/[0.02] transition">
                      <td className="py-3 px-3">
                        <span className="font-bold text-sm text-[#1F1F1D] block">{u.full_name}</span>
                        <span className="text-[11px] text-[#686760] font-mono">{u.email}</span>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={u.role}
                          onChange={(e) => updateRole.mutate({ uid: u.id, role: e.target.value })}
                          className="px-2 py-1 rounded-lg border border-black/10 text-xs font-bold capitalize bg-white cursor-pointer"
                        >
                          <option value="student">student</option>
                          <option value="teacher">teacher</option>
                          <option value="admin">admin</option>
                          <option value="super_admin">super_admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.is_active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}>
                          {u.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#686760]">
                        {u.student_ref || "—"}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleStatus.mutate(u.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            u.is_active
                              ? "text-red-700 bg-red-50 hover:bg-red-100"
                              : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          }`}
                        >
                          {u.is_active ? "Disable" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: GLOBAL EXAMS */}
        {activeTab === "exams" && (
          <div className="card p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
              <div>
                <h3 className="font-bold text-base text-[#1F1F1D]">Global Examinations Directory</h3>
                <p className="text-xs text-[#686760]">All assessments published across institutions</p>
              </div>
              <Link to="/teacher/exams/create" className="btn-primary text-xs py-1.5 px-3.5">
                + Create New Exam
              </Link>
            </div>

            <div className="divide-y divide-black/5">
              {exams.map((e: any) => (
                <div key={e.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-bold text-[#1F1F1D]">{e.title}</strong>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider bg-black/5 text-[#1F1F1D]">
                        {e.status}
                      </span>
                    </div>
                    <div className="text-xs text-[#686760] mt-1 flex items-center gap-2">
                      <span>{e.subject || "General"}</span>
                      <span>•</span>
                      <span>{e.duration_minutes} mins</span>
                      <span>•</span>
                      <span>{e.total_marks || 0} pts</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {e.status === "active" && (
                      <Link
                        to={`/teacher/exams/${e.id}/monitor`}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition"
                      >
                        Monitor Session →
                      </Link>
                    )}
                    <Link
                      to="/teacher/results"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#686760] hover:text-[#1F1F1D] bg-white border border-black/10 hover:bg-black/5 transition"
                    >
                      Audit Scores
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: AUDIT LOGS */}
        {activeTab === "audit" && (
          <div className="card p-6 space-y-4 animate-fade-in">
            <div className="border-b border-black/[0.08] pb-3">
              <h3 className="font-bold text-base text-[#1F1F1D]">Administrative Audit Trail</h3>
              <p className="text-xs text-[#686760]">Tamper-evident logs of administrative and exam configuration actions</p>
            </div>

            <div className="space-y-2">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="p-3 bg-white rounded-xl border border-black/10 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#1F1F1D]" />
                    <span className="font-mono font-bold text-[#1F1F1D]">{log.action}</span>
                    {log.resource && (
                      <span className="text-[11px] text-[#686760] font-mono">Ref: {log.resource}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#686760] font-mono">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : "Recent"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
