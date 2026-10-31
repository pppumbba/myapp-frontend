import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminRoute, GuestRoute, ProtectedRoute } from './auth/routes';
import { AppShell } from './components/AppShell';
import { ScreenApp } from './render/ScreenApp';
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
import ApprovePage from './pages/market/ApprovePage';
import CompanyPage from './pages/market/CompanyPage';
import ContractPage from './pages/market/ContractPage';
import ContractsPage from './pages/market/ContractsPage';
import NewContractPage from './pages/market/NewContractPage';
import PaymentsPage from './pages/market/PaymentsPage';
import JoinPage from './pages/market/JoinPage';
import MarketAccountPage from './pages/market/MarketAccountPage';
import MarketDisputesPage from './pages/market/MarketDisputesPage';
import MarketFeesPage from './pages/market/MarketFeesPage';
import MarketReviewsPage from './pages/market/MarketReviewsPage';
import BidEditor from './pages/market/tenders/BidEditor';
import MyBidsPage from './pages/market/tenders/MyBidsPage';
import MyTendersPage from './pages/market/tenders/MyTendersPage';
import NewTenderPage from './pages/market/tenders/NewTenderPage';
import TenderPage from './pages/market/tenders/TenderPage';
import TendersPage from './pages/market/tenders/TendersPage';
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
      {/* Screens inside the main sidebar. The shell stays mounted while they change, so moving
          between them doesn't rebuild the menu or refetch its notifications. */}
      <Route element={<ProtectedRoute><AppShell><Outlet /></AppShell></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/metas" element={<AdminRoute><MetasPage /></AdminRoute>} />
        <Route path="/metas/usage" element={<AdminRoute><MetaUsagePage /></AdminRoute>} />
        <Route path="/metas/:id" element={<AdminRoute><MetaDetailPage /></AdminRoute>} />
        <Route path="/query-builder" element={<AdminRoute><QueryBuilderPage /></AdminRoute>} />
        <Route path="/query-builder/:id" element={<AdminRoute><QueryBuilderPage /></AdminRoute>} />
        <Route path="/sites" element={<AdminRoute><SitesPage /></AdminRoute>} />
        <Route path="/sites/:id" element={<AdminRoute><SiteManagerPage /></AdminRoute>} />
        <Route path="/widgets" element={<AdminRoute><WidgetsPage /></AdminRoute>} />
        <Route path="/schedules" element={<AdminRoute><SchedulesPage /></AdminRoute>} />
        <Route path="/patches" element={<AdminRoute><PatchesPage /></AdminRoute>} />
        <Route path="/session-values" element={<AdminRoute><SessionValuesPage /></AdminRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/admin/roles/:id" element={<AdminRoute><RoleWorkspacePage /></AdminRoute>} />
      </Route>
      {/* Built-in pages (screen metas): each shows inside the meta app whose menu holds it, here
          the Tender market app. The frame stays mounted while moving between them. */}
      <Route element={<ProtectedRoute><ScreenApp /></ProtectedRoute>}>
        <Route path="/admin/market-reviews" element={<AdminRoute><MarketReviewsPage /></AdminRoute>} />
        <Route path="/admin/market-disputes" element={<AdminRoute><MarketDisputesPage /></AdminRoute>} />
        <Route path="/admin/market-fees" element={<AdminRoute><MarketFeesPage /></AdminRoute>} />
        <Route path="/market/account" element={<MarketAccountPage />} />
        <Route path="/market/companies/:id" element={<CompanyPage />} />
        <Route path="/market/approve/:token" element={<ApprovePage />} />
        <Route path="/market/join/:token" element={<JoinPage />} />
        <Route path="/market/contracts" element={<ContractsPage />} />
        <Route path="/market/contracts/new" element={<NewContractPage />} />
        <Route path="/market/contracts/:id" element={<ContractPage />} />
        <Route path="/market/payments" element={<PaymentsPage />} />
        <Route path="/market/tenders" element={<TendersPage />} />
        <Route path="/market/tenders/mine" element={<MyTendersPage />} />
        <Route path="/market/tenders/new" element={<NewTenderPage />} />
        <Route path="/market/tenders/:id" element={<TenderPage />} />
        <Route path="/market/tenders/:id/edit" element={<NewTenderPage />} />
        <Route path="/market/tenders/:id/bid" element={<BidEditor />} />
        <Route path="/market/bids" element={<MyBidsPage />} />
      </Route>
      <Route path="/studio" element={<AdminRoute><StudioPage /></AdminRoute>} />
      <Route path="/studio/:id" element={<AdminRoute><StudioPage /></AdminRoute>} />
      <Route path="/site-preview/:id/*" element={<AdminRoute><SitePreviewPage /></AdminRoute>} />
      <Route path="/run/:id" element={<ProtectedRoute><RunPage /></ProtectedRoute>} />
      {/* Public metas, for anyone: no sign-in needed. */}
      <Route path="/portal/:id" element={<PortalPage />} />
      {/* Websites' published pages, before they have (or besides) their own domain. */}
      <Route path="/site/:code/*" element={<PublicSitePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
