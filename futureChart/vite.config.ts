import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5180,
    /** 5180 사용 중(별도 터미널 `npm run dev`)이면 다음 포트로 올라감 — `dev:local` 전체가 죽지 않게 */
    strictPort: false,
  },
});
