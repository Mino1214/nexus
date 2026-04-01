/**
 * Nexus PM2 묶음 — 앱 이름 = 서비스 디렉터리/역할과 동일
 *
 *   macro-server, seed-checker, nexus-market-api, future-chart
 *
 * 사용:
 *   cd deploy/pm2 && pm2 start ecosystem.config.cjs && pm2 save
 *
 * 레거시 이름(server, mynolab-server)에서 전환:
 *   pm2 delete server mynolab-server && cd deploy/pm2 && pm2 start ecosystem.config.cjs
 */
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

/** PM2 5.x — 대시보드에서 네임스페이스로 묶임 (미지원 버전이면 이름 prefix 만으로도 구분됨) */
const NS = 'nexus';

module.exports = {
  apps: [
    /* ─── Pandora 코어 (services/macro-server) ─── */
    {
      name: 'macro-server',
      namespace: NS,
      script: 'server.js',
      cwd: path.join(REPO, 'services/macro-server'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        // Nginx 프록시와 맞출 것 — 마켓 API(아래)와 포트 충돌 금지
        PORT: 3001,
      },
    },
    {
      name: 'seed-checker',
      namespace: NS,
      script: 'seed-checker.js',
      cwd: path.join(REPO, 'services/macro-server'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      },
    },

    /* ─── 총마켓 API (services/nexus-market-api) ─── */
    {
      name: 'nexus-market-api',
      namespace: NS,
      script: 'server.js',
      cwd: path.join(REPO, 'services/nexus-market-api'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        // 기본 server.js 는 3001 이므로, 마켓 전용 포트로 분리 권장 (판도라 3001 과 동시 기동 시 필수)
        PORT: 3000,
      },
    },

    /*
    ─── future-chart-broker (KIS_APP_KEY / KIS_APP_SECRET 필요) — 준비되면 주석 해제 ───
    {
      name: 'future-chart-broker',
      namespace: NS,
      script: 'src/index.js',
      cwd: path.join(REPO, 'services/future-chart-broker'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: { NODE_ENV: 'production' },
    },
    */

    /* ─── FutureChart Vite (외부 테스트: Nginx → /future-chart/) ─── */
    {
      name: 'future-chart',
      namespace: NS,
      cwd: path.join(REPO, 'futureChart'),
      script: 'npm',
      args: 'run dev:public',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'development',
        VITE_PUBLIC_BASE: '/future-chart/',
        VITE_BIND_HOST: '0.0.0.0',
        VITE_DEV_PORT: '5180',
        /** Nginx/Cloudflare 등 프록시 Host — 막히면 all 로 전체 허용(테스트용) */
        VITE_ALLOWED_HOSTS: 'all',
      },
    },

    /*
    ─── (선택) 총괄 admin 을 Node 로 띄울 때만 — 보통은 Nginx → dist 정적 ───
    {
      name: 'nx-platform-masteradmin-preview',
      namespace: NS,
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 127.0.0.1 --port 3230',
      cwd: path.join(REPO, 'masterAdmin'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
    */
  ],
};
