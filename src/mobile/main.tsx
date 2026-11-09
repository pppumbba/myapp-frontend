import { Fragment, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-aria-components';
import { HashRouter, useHref, useNavigate } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { ThemeProvider } from '../components/ThemeProvider';
import { Notices } from '../components/Notices';
import { bootLocale, useLocale } from '../i18n';
import { MobileApp } from './MobileApp';
import '../index.css';

/** Lets Untitled UI (React Aria) links navigate inside the app instead of reloading the page. */
function AriaRouter({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      {children}
    </RouterProvider>
  );
}

/** Draws the screens again in a new language: their text is translated as they render. */
function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = useLocale();
  return <Fragment key={locale}>{children}</Fragment>;
}

// The phone app lives in one page (a WebView, or mobile.html in a browser), so its screens are
// addressed after the # and every reload lands back on that page.
bootLocale().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <AriaRouter>
          <AuthProvider>
            <ThemeProvider>
              <LocaleRoot>
                <MobileApp />
                <Notices />
              </LocaleRoot>
            </ThemeProvider>
          </AuthProvider>
        </AriaRouter>
      </HashRouter>
    </StrictMode>,
  ),
);
