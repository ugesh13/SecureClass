import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TeacherDashboard from "./pages/TeacherDashboard";
import QuestionBank from "./pages/QuestionBank";
import ExamCreate from "./pages/ExamCreate";
import TeacherExams from "./pages/TeacherExams";
import TeacherMonitor from "./pages/TeacherMonitor";
import TeacherResults from "./pages/TeacherResults";
import TeacherSettings from "./pages/TeacherSettings";
import StudentDashboard from "./pages/StudentDashboard";
import StudentExams from "./pages/StudentExams";
import StudentResults from "./pages/StudentResults";
import StudentProfile from "./pages/StudentProfile";
import ExamTake from "./pages/ExamTake";
import { useAuth } from "./contexts/AuthContext";

function Protected({
  children,
  roles,
}: {
  children: JSX.Element;
  roles?: string[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 font-semibold text-sm">Loading SecureClass…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Teacher Routes */}
      <Route
        path="/teacher/dashboard"
        element={
          <Protected roles={["teacher", "admin", "super_admin"]}>
            <TeacherDashboard />
          </Protected>
        }
      />
      <Route
        path="/teacher/questions"
        element={
          <Protected roles={["teacher", "admin", "super_admin"]}>
            <QuestionBank />
          </Protected>
        }
      />
      <Route
        path="/teacher/exams"
        element={
          <Protected roles={["teacher", "admin", "super_admin"]}>
            <TeacherExams />
          </Protected>
        }
      />
      <Route
        path="/teacher/exams/create"
        element={
          <Protected roles={["teacher", "admin", "super_admin"]}>
            <ExamCreate />
          </Protected>
        }
      />
      <Route
        path="/teacher/exams/:id/monitor"
        element={
          <Protected roles={["teacher", "admin", "super_admin"]}>
            <TeacherMonitor />
          </Protected>
        }
      />
      <Route
        path="/teacher/results"
        element={
          <Protected roles={["teacher", "admin", "super_admin"]}>
            <TeacherResults />
          </Protected>
        }
      />
      <Route
        path="/teacher/settings"
        element={
          <Protected roles={["teacher", "admin", "super_admin"]}>
            <TeacherSettings />
          </Protected>
        }
      />

      {/* Student Routes */}
      <Route
        path="/student/dashboard"
        element={
          <Protected roles={["student"]}>
            <StudentDashboard />
          </Protected>
        }
      />
      <Route
        path="/student/exams"
        element={
          <Protected roles={["student"]}>
            <StudentExams />
          </Protected>
        }
      />
      <Route
        path="/student/results"
        element={
          <Protected roles={["student"]}>
            <StudentResults />
          </Protected>
        }
      />
      <Route
        path="/student/profile"
        element={
          <Protected roles={["student"]}>
            <StudentProfile />
          </Protected>
        }
      />

      {/* Live Exam Taking Routes */}
      <Route
        path="/exam/join/:token"
        element={
          <Protected>
            <ExamTake />
          </Protected>
        }
      />
      <Route
        path="/exam/attempt/:attemptId"
        element={
          <Protected>
            <ExamTake />
          </Protected>
        }
      />

      {/* Fallback 404 */}
      <Route
        path="*"
        element={
          <div className="p-12 text-center">
            <h1 className="text-3xl font-extrabold text-[#1F1F1D]">404 — Page Not Found</h1>
            <p className="text-sm text-[#686760] mt-2">The requested SecureClass page does not exist.</p>
          </div>
        }
      />
    </Routes>
  );
}
