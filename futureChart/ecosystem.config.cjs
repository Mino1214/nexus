/**
 * PM2: FutureChart Vite
 * 외부 공개: Nginx `location /future-chart/` → 127.0.0.1:5180 (VITE_PUBLIC_BASE=/future-chart/)
 *
 *   cd futureChart && npm install
 *   pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'future-chart',
      cwd: __dirname,
      script: 'npm',
      args: 'run dev:public',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'development',
        VITE_PUBLIC_BASE: '/future-chart/',
        VITE_BIND_HOST: '0.0.0.0',
        VITE_DEV_PORT: '5180',
        VITE_ALLOWED_HOSTS: 'all',
      },
    },
  ],
};
