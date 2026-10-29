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
import RoleWorkspacePage from './pages/RoleWorkspacePage';
import SchedulesPage from './pages/SchedulesPage';
import PatchesPage from './pages/PatchesPage';
import PortalPage from './pages/PortalPage';
import SessionValuesPage from './pages/SessionValuesPage';
import QueryBuilderPage from './pages/QueryBuilderPage';
import WidgetsPage from './pages/WidgetsPage';
import MetaDetailPage from './pages/metas/MetaDetailPage';
import MetasPage from './pages/metas/MetasPage';
import MetaUsagePage from './pages/metas/MetaUsagePage';
import StudioPage from './pages/studio/StudioPage';
import SiteManagerPage from './pages/sites/SiteManagerPage';
import SitesPage from './pages/sites/SitesPage';
import { PublicSitePage, SitePreviewPage } from './pages/sites/SiteView';

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
      <Route path="/metas/usage" element={<AdminRoute><MetaUsagePage /></AdminRoute>} />
      <Route path="/metas/:id" element={<AdminRoute><MetaDetailPage /></AdminRoute>} />
      <Route path="/query-builder" element={<AdminRoute><QueryBuilderPage /></AdminRoute>} />
      <Route path="/query-builder/:id" element={<AdminRoute><QueryBuilderPage /></AdminRoute>} />
      <Route path="/studio" element={<AdminRoute><StudioPage /></AdminRoute>} />
      <Route path="/studio/:id" element={<AdminRoute><StudioPage /></AdminRoute>} />
      <Route path="/sites" element={<AdminRoute><SitesPage /></AdminRoute>} />
      <Route path="/sites/:id" element={<AdminRoute><SiteManagerPage /></AdminRoute>} />
      <Route path="/site-preview/:id/*" element={<AdminRoute><SitePreviewPage /></AdminRoute>} />
      <Route path="/widgets" element={<AdminRoute><WidgetsPage /></AdminRoute>} />
      <Route path="/schedules" element={<AdminRoute><SchedulesPage /></AdminRoute>} />
      <Route path="/patches" element={<AdminRoute><PatchesPage /></AdminRoute>} />
      <Route path="/session-values" element={<AdminRoute><SessionValuesPage /></AdminRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="/admin/roles/:id" element={<AdminRoute><RoleWorkspacePage /></AdminRoute>} />
      <Route path="/run/:id" element={<ProtectedRoute><RunPage /></ProtectedRoute>} />
      {/* Public metas, for anyone: no sign-in needed. */}
      <Route path="/portal/:id" element={<PortalPage />} />
      {/* Websites' published pages, before they have (or besides) their own domain. */}
      <Route path="/site/:code/*" element={<PublicSitePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
