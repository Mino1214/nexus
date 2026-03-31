/**
 * 인증 없는 공개 API (총마켓 랜딩·포털용).
 * 테넌트 없이 접근; resolveMarketTenant 앞단에서 마운트됨.
 */
const express = require('express');
const db = require('../../db');

const router = express.Router();

/** GET /catalog/modules — totalMarket 랜딩·모듈 페이지 (활성 카탈로그만) */
router.get('/catalog/modules', async (_req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT slug, name, description, sort_order, admin_entry_url, ops_entry_url
       FROM master_catalog_modules
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`,
    );
    res.json({ modules: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, slice: 'public' });
});

router.get('/ping', (_req, res) => {
  res.json({ ok: true, scope: 'market-public' });
});

module.exports = router;
