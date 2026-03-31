const express = require('express');
const path = require('path');
const { resolveMarketTenant } = require('./middleware');
const publicCatalogRoutes = require('./routes/publicCatalog');
const authRoutes = require('./routes/auth');
const masterRoutes = require('./routes/master');
const operatorRoutes = require('./routes/operator');
const userRoutes = require('./routes/user');

const videoUploadDir = path.join(__dirname, '..', 'uploads', 'market-videos');
const catalogUploadDir = path.join(__dirname, '..', 'uploads', 'market-catalog');

function mountMarketApi(app) {
  fsEnsureDir(videoUploadDir);
  fsEnsureDir(catalogUploadDir);
  app.use('/market-static/videos', express.static(videoUploadDir));
  app.use('/market-static/catalog', express.static(catalogUploadDir));

  app.use('/api/market/public', publicCatalogRoutes);
  app.use('/market/public', publicCatalogRoutes);

  const market = express.Router();
  market.get('/ping', (_req, res) => {
    res.json({ ok: true, service: 'nexus-market-api', t: new Date().toISOString() });
  });
  market.use(resolveMarketTenant);
  market.use('/auth', authRoutes);
  market.use('/master', masterRoutes);
  market.use('/operator', operatorRoutes);
  market.use('/user', userRoutes);

  /**
   * - 정상: /api/market/auth/login
   * - Nginx 가 /api 를 떼고 넘기는 경우: /market/auth/login 로 도착 → 동일 라우터로 처리
   */
  app.use('/api/market', market);
  app.use('/market', market);
  console.log('[market] mounted at /api/market and /market');
}

function fsEnsureDir(dir) {
  const fs = require('fs');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_e) {
    /* ignore */
  }
}

module.exports = { mountMarketApi };
