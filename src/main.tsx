import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-aria-components';
import { BrowserRouter, useHref, useNavigate } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AriaRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AriaRouter>
    </BrowserRouter>
  </StrictMode>,
);
