import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Review from './pages/Review.jsx'
import Report from './pages/Report.jsx'
import Analysis from './pages/Analysis.jsx'
import Identify from './pages/Identify.jsx'
import Users from './pages/Users.jsx'
import SubjectData from './pages/SubjectData.jsx'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      {/* No self-signup: accounts are created by an admin on /users */}
      <Route path="/signup" element={<Navigate to="/login" replace />} />

      {/* Protected routes — wrapped in AppShell */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/identify" element={<Identify />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/review" element={<Review />} />
        <Route path="/review/report/:id" element={<Report />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route
          path="/subjects"
          element={
            <ProtectedRoute roles={['admin']}>
              <SubjectData />
            </ProtectedRoute>
          }
        />
        {/* Old URL of the page (ante-mortem only) — keep bookmarks working */}
        <Route path="/am-records" element={<Navigate to="/subjects?type=am" replace />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['admin']}>
              <Users />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Root and catch-all redirect to dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
