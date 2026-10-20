import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute, GuestRoute, ProtectedRoute } from './auth/routes';
import AdminPage from './pages/AdminPage';
import AppsPage from './pages/AppsPage';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import Register from './pages/Register';
import RunPage from './pages/RunPage';
import MetaDetailPage from './pages/metas/MetaDetailPage';
import MetasPage from './pages/metas/MetasPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/apps" element={<ProtectedRoute><AppsPage /></ProtectedRoute>} />
      <Route path="/metas" element={<AdminRoute><MetasPage /></AdminRoute>} />
      <Route path="/metas/:id" element={<AdminRoute><MetaDetailPage /></AdminRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="/run/:id" element={<ProtectedRoute><RunPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
