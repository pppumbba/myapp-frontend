import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const backend = (loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '');
  return {
    plugins: [react(), tailwindcss()],
    // Two pages: the web app, and the phone app (mobile.html, one app meta and no builder; see src/mobile).
    build: { rollupOptions: { input: { main: 'index.html', mobile: 'mobile.html' } } },
    // Untitled UI components import from "@/...".
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      // Google takes http://localhost redirects but not .test ones, so in development Google
      // sign-in goes through here (GOOGLE_REDIRECT_URI=http://localhost:5173/auth/google/callback).
      proxy: backend ? { '/auth/google': { target: backend, changeOrigin: true } } : undefined,
    },
  };
});
