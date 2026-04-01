/**
 * (레거시 단독 설정) 통합 묶음: ../../deploy/pm2/ecosystem.config.cjs
 * PM2: Nginx → localhost 와 PORT 맞출 것
 * 사용: pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'server',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
