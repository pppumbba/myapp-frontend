import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { t } from '@/i18n';

const RETURN_KEY = 'return_to';

/**
 * Where to go after signing in: the page that sent the user to log in (e.g. a link a director or
 * colleague was sent), else home. Kept in sessionStorage so it survives the trip through Google.
 */
export function returnPath(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    // Only a page of this app, never another site.
    return path && path.startsWith('/') && !path.startsWith('//') ? path : '/';
  } catch {
    return '/';
  }
}

function setReturnPath(path: string | null) {
  try {
    if (path) sessionStorage.setItem(RETURN_KEY, path);
    else sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Storage can be blocked; signing in then goes home.
  }
}

/** Sends a signed-out user to /login, remembering this page to come back to. */
function ToLogin() {
  const { pathname, search } = useLocation();
  if (pathname !== '/') setReturnPath(pathname + search);
  return <Navigate to="/login" replace />;
}

/** Forgets the page to return to once the user is on it. */
function Arrived({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  if (returnPath() === pathname + search) setReturnPath(null);
  return <>{children}</>;
}

/** Only signed-in users may see this. Others go to /login. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <ToLogin />;
  return <Arrived>{children}</Arrived>;
}

/** Only admins: the builder and user management. Others go home. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <ToLogin />;
  if (!isAdmin) {
    setReturnPath(null);
    return <Navigate to="/" replace />;
  }
  return <Arrived>{children}</Arrived>;
}

/** Signed-in users are sent away from login and register: back to where they were going. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to={returnPath()} replace />;
  return <>{children}</>;
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-tertiary">
      {t("Loading…")}
    </div>
  );
}
