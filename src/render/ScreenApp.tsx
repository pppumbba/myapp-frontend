import { Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Alert } from '../components/ui';
import { screenFor, useScreens } from '../lib/screenApi';
import { AppView } from './AppView';
import { useMetaDef } from './definitions';

const Loading = () => <div className="min-h-screen animate-pulse bg-primary motion-reduce:animate-none" />;

/**
 * Layout route for built-in pages (screen metas): the page shows inside the app whose menu
 * holds its screen, e.g. /market/contracts inside the Tender market app. A page no app holds
 * falls back to the main shell. The frame stays mounted while moving between its screens.
 */
export function ScreenApp() {
  const { pathname } = useLocation();
  const screens = useScreens();
  if (!screens) return <Loading />;

  const screen = screenFor(screens, pathname);
  if (!screen) {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }
  return <ScreenFrame appId={screen.app_ids[0]} active={pathname === screen.path || pathname.startsWith(`${screen.path}/`) ? screen.path : undefined} />;
}

function ScreenFrame({ appId, active }: { appId: number; active: string | undefined }) {
  const { def, error } = useMetaDef(appId);
  if (error) return <Alert>{error}</Alert>;
  if (!def) return <Loading />;
  return (
    <AppView def={def} activePath={active}>
      <Outlet />
    </AppView>
  );
}
