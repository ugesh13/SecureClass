import { useQuery } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

export default function StudentProfile() {
  const { user } = useAuth();

  const { data: disclosure } = useQuery({
    queryKey: ["privacy-disclosure"],
    queryFn: async () => (await api.get("/privacy/disclosure")).data,
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="border-b border-black/[0.08] pb-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1F1F1D] tracking-tight">
            Student Profile & Privacy Center
          </h1>
          <p className="text-xs sm:text-sm text-[#686760] mt-1">
            Account information, verified enrollments, and academic integrity policies.
          </p>
        </div>

        {/* Account Details Card */}
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-base text-[#1F1F1D]">Student Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div className="p-3.5 bg-white rounded-xl border border-black/10">
              <span className="text-xs text-[#686760] block mb-0.5">Full Name</span>
              <strong className="text-[#1F1F1D]">{user?.full_name}</strong>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-black/10">
              <span className="text-xs text-[#686760] block mb-0.5">Email Address</span>
              <strong className="text-[#1F1F1D]">{user?.email}</strong>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-black/10">
              <span className="text-xs text-[#686760] block mb-0.5">Account Role</span>
              <strong className="text-[#1F1F1D] capitalize">{user?.role}</strong>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-black/10">
              <span className="text-xs text-[#686760] block mb-0.5">Academic Status</span>
              <span className="text-emerald-700 font-bold">Active Enrolled Test-Taker</span>
            </div>
          </div>
        </div>

        {/* Privacy & Academic Integrity Notice */}
        {disclosure && (
          <div className="card p-6 space-y-4 bg-gradient-to-r from-blue-50/60 to-indigo-50/60 border-blue-200">
            <div>
              <h3 className="font-bold text-base text-blue-950">{disclosure.title}</h3>
              <p className="text-xs text-blue-900 mt-1 leading-relaxed">
                {disclosure.purpose}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                Monitored Session Telemetries:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {disclosure.events_collected?.map((e: any) => (
                  <div key={e.event} className="p-3 bg-white/90 rounded-xl border border-blue-100">
                    <span className="font-bold text-blue-950 block">{e.event}</span>
                    <span className="text-blue-800 text-[11px] block mt-0.5">{e.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-blue-200/80 text-xs text-blue-900 space-y-1">
              <span className="font-bold block">Your Student Rights:</span>
              <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                {disclosure.student_rights?.map((r: string, idx: number) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
