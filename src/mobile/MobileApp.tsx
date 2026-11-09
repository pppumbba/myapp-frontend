import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestRoute, ProtectedRoute, SignedInRoute } from '../auth/routes';
import { mobileAppId } from '../lib/mobileApi';
import NotificationsPage from '../pages/NotificationsPage';
import CompanyPage from '../pages/market/CompanyPage';
import ContractPage from '../pages/market/ContractPage';
import ContractsPage from '../pages/market/ContractsPage';
import NewContractPage from '../pages/market/NewContractPage';
import PaymentsPage from '../pages/market/PaymentsPage';
import JoinPage from '../pages/market/JoinPage';
import ApprovePage from '../pages/market/ApprovePage';
import MarketAccountPage from '../pages/market/MarketAccountPage';
import BidEditor from '../pages/market/tenders/BidEditor';
import MyBidsPage from '../pages/market/tenders/MyBidsPage';
import MyTendersPage from '../pages/market/tenders/MyTendersPage';
import NewTenderPage from '../pages/market/tenders/NewTenderPage';
import TenderPage from '../pages/market/tenders/TenderPage';
import TendersPage from '../pages/market/tenders/TendersPage';
import { MobileHome, MobileRun, MobileShell } from './MobileShell';
import { MobileLogin, MobilePick } from './MobileSignIn';
import { t } from '@/i18n';

/**
 * The phone app: one app meta, its screens and the built-in pages its menu holds (the market's),
 * and nothing of the builder. Signing in, then the app's customer, then straight into the app.
 */
export function MobileApp() {
  const appId = mobileAppId();
  if (!appId) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-secondary p-6 text-center">
        <p className="max-w-xs text-sm text-tertiary">{t('This phone app was built without an app to open.')}</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><MobileLogin appId={appId} /></GuestRoute>} />
      <Route path="/start" element={<SignedInRoute><MobilePick appId={appId} /></SignedInRoute>} />
      <Route element={<ProtectedRoute><MobileShell appId={appId} /></ProtectedRoute>}>
        <Route path="/" element={<MobileHome />} />
        <Route path="/run/:id" element={<MobileRun />} />
        <Route path="/notifications" element={<NotificationsPage />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
