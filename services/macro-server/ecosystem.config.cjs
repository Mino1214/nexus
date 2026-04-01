/**
 * Pandora 코어 (admin, /api/login, 결제 등). Market API는 nexus-market-api(3000)에서 담당.
 * 사용: pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'mynolab-server',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
