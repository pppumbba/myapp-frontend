import { Fragment, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-aria-components';
import { BrowserRouter, useHref, useNavigate } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './components/ThemeProvider';
import { bootLocale, useLocale } from './i18n';
import { siteHost } from './lib/siteApi';
import { SiteHostApp } from './pages/sites/SiteView';
import { Notices } from './components/Notices';
import './index.css';

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

// On a website's own domain the browser shows that site, not the app (see siteHost).
const host = siteHost();

bootLocale().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AriaRouter>
          <AuthProvider>
            <ThemeProvider>
              <LocaleRoot>
                {host ? (
                  <SiteHostApp host={host} />
                ) : (
                  <>
                    <App />
                    <Notices />
                  </>
                )}
              </LocaleRoot>
            </ThemeProvider>
          </AuthProvider>
        </AriaRouter>
      </BrowserRouter>
    </StrictMode>,
  ),
);
