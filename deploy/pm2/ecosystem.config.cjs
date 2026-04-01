/**
 * Nexus PM2 묶음 — 프로세스 이름으로 역할이 한눈에 보이게 정리
 *
 * 도메인 그림 (예시):
 *   - 총괄 admin  → masterAdmin 정적 + (선택) 별도 API
 *   - 마켓        → nexus-market-api (+ totalMarket 등 프론트는 Nginx 정적)
 *   - A Pandora   → macro-server (웹은 Nginx → public/)
 *   - B Future    → future-chart-broker (WS) + FutureChart 정적
 *
 * DB: MariaDB 하나에 macro·market·users 공유 (지금 구조). A-1, A-2 스케일은
 *   동일 코드 + 다른 PORT / 다른 env(TELEGRAM 등)로 앱만 복제하면 됨.
 *
 * 사용:
 *   cd deploy/pm2 && pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * 그룹 보기: pm2 list | grep nx-
 * 재시작:   pm2 restart nx-core-market-api
 */
const path = require('path');

const REPO = path.resolve(__dirname, '../..');

/** PM2 5.x — 대시보드에서 네임스페이스로 묶임 (미지원 버전이면 이름 prefix 만으로도 구분됨) */
const NS = 'nexus';

module.exports = {
  apps: [
    /* ─── A: Pandora (macro-server) ─── */
    {
      name: 'nx-a-pandora-api',
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
      name: 'nx-a-pandora-seedcheck',
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

    /* ─── 코어: 마켓 API (총판·JWT·HTS 연동) ─── */
    {
      name: 'nx-core-market-api',
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

    /* ─── B: FutureChart 브로커 (WS) — 미사용 시 주석 처리 ─── */
    {
      name: 'nx-b-future-broker',
      namespace: NS,
      script: 'src/index.js',
      cwd: path.join(REPO, 'services/future-chart-broker'),
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
