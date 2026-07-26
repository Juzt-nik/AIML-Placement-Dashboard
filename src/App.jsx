import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Mentors from './pages/Mentors'
import Report from './pages/Report'
import Requests from './pages/Requests'
import StudentsHub from './pages/students/StudentsHub'
import ClassList from './pages/students/ClassList'
import ClassRoster from './pages/students/ClassRoster'
import StudentProfile from './pages/students/StudentProfile'
import Placement from './pages/students/Placement'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="state-msg">Loading&hellip;</div>
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  return <Layout>{children}</Layout>
}

function RequireCoordinator({ children }) {
  const { session, loading, isCoordinator } = useAuth()
  const location = useLocation()

  if (loading) return <div className="state-msg">Loading&hellip;</div>
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (!isCoordinator) return <Layout><p className="state-msg">This page is only available to coordinators.</p></Layout>
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { session } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />

      <Route path="/students" element={<RequireAuth><StudentsHub /></RequireAuth>}>
        <Route index element={<Navigate to="details" replace />} />
        <Route path="details" element={<ClassList />} />
        <Route path="details/:className" element={<ClassRoster />} />
        <Route path="details/:className/:studentId" element={<StudentProfile />} />
        <Route path="placement" element={<Placement />} />
      </Route>

      <Route path="/mentors" element={<RequireAuth><Mentors /></RequireAuth>} />
      <Route path="/report" element={<RequireAuth><Report /></RequireAuth>} />
      <Route path="/requests" element={<RequireCoordinator><Requests /></RequireCoordinator>} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}