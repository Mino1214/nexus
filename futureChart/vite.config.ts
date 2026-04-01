import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Nginx `location /future-chart/` 프록시 시: VITE_PUBLIC_BASE=/future-chart/ */
const base = process.env.VITE_PUBLIC_BASE?.trim() || './';
const host = process.env.VITE_BIND_HOST?.trim() || '127.0.0.1';
const port = Number(process.env.VITE_DEV_PORT || 5180) || 5180;

/** 리버스 프록시 Host 검사 — 없으면 "Blocked request... host is not allowed" */
function allowedHostsOption() {
  const raw = process.env.VITE_ALLOWED_HOSTS?.trim();
  if (raw === 'all' || raw === '*') return true;
  const extra = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const defaults = ['nexus001.vip', 'www.nexus001.vip', 'localhost', '127.0.0.1'];
  return [...new Set([...defaults, ...extra])];
}

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    host,
    port,
    strictPort: false,
    allowedHosts: allowedHostsOption(),
  },
});
