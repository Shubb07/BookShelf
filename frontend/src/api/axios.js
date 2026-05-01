import axios from 'axios';

// ─── Base URL ────────────────────────────────────────────────────────────────
// In production (Vercel): set VITE_API_URL in Project → Settings → Env Vars
//   Value: https://bookshelf-4brs.onrender.com/api   ← NO trailing slash
//
// In local dev (npm run dev): leave VITE_API_URL unset.
//   Vite proxy in vite.config.js will forward /api → http://localhost:8000/api
// ─────────────────────────────────────────────────────────────────────────────

const isDev = import.meta.env.DEV; // true during `npm run dev`, false in build

// Grab the env var and strip any accidental trailing slash
const ENV_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

// In production, VITE_API_URL MUST be set — abort loudly so it's obvious
if (!isDev && !ENV_URL) {
  throw new Error(
    '[BookShelf] CRITICAL: VITE_API_URL is not set.\n' +
    'Go to Vercel → Project → Settings → Environment Variables and add:\n' +
    '  VITE_API_URL = https://bookshelf-4brs.onrender.com/api\n' +
    'Then redeploy.'
  );
}

// Local dev falls back to the Vite proxy path; prod always uses the full URL
const BASE_URL = ENV_URL || '/api';

console.log(`[api] mode=${isDev ? 'dev' : 'prod'} | BASE_URL=${BASE_URL}`);

// ─── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach JWT ─────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Debug: log every outgoing request URL so you can verify in DevTools
  console.debug(`[api] ${config.method?.toUpperCase()} ${config.baseURL}/${config.url}`);
  return config;
});

// ─── Response interceptor: auto-refresh on 401 ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const res = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
          localStorage.setItem('access_token', res.data.access);
          original.headers.Authorization = `Bearer ${res.data.access}`;
          return api(original);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
