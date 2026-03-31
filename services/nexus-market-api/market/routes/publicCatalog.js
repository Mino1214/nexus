/**
 * 인증 없는 공개 API (총마켓 랜딩·포털용).
 * 테넌트 없이 접근; resolveMarketTenant 앞단에서 마운트됨.
 */
const express = require('express');
const db = require('../../db');
const { kstTodayString } = require('../kst');

const router = express.Router();

/** GET /catalog/modules — totalMarket 랜딩·모듈 페이지 (활성 카탈로그만) */
router.get('/catalog/modules', async (_req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT slug, name, description, sort_order, admin_entry_url, ops_entry_url,
              thumbnail_url, detail_markdown, gallery_json, body_html
       FROM master_catalog_modules
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`,
    );
    res.json({ modules: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /catalog/modules/:slug — 상세(팝업용) */
router.get('/catalog/modules/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '')
      .trim()
      .toLowerCase();
    const [[row]] = await db.pool.query(
      `SELECT slug, name, description, sort_order, admin_entry_url, ops_entry_url,
              thumbnail_url, detail_markdown, gallery_json, body_html
       FROM master_catalog_modules
       WHERE slug = ? AND is_active = 1
       LIMIT 1`,
      [slug],
    );
    if (!row) return res.status(404).json({ error: '모듈 없음' });
    res.json({ module: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /videos/featured — 추천(승인·홈·추천 플래그) */
router.get('/videos/featured', async (_req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT id, title, file_url, thumbnail_url, created_at
       FROM market_videos
       WHERE status = 'approved' AND show_on_home = 1 AND is_featured = 1
       ORDER BY featured_sort ASC, id DESC
       LIMIT 40`,
    );
    res.json({ videos: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /videos/latest — 최신 승인 영상 */
router.get('/videos/latest', async (_req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT id, title, file_url, thumbnail_url, created_at
       FROM market_videos
       WHERE status = 'approved' AND show_on_home = 1
       ORDER BY id DESC
       LIMIT 40`,
    );
    res.json({ videos: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /portal/popup — 현재 활성 팝업 (하루동안 보지않기: 클라이언트에서 KST 날짜로 처리) */
router.get('/portal/popup', async (_req, res) => {
  try {
    const now = new Date();
    const [rows] = await db.pool.query(
      `SELECT id, title, body_html, image_url, link_url, link_text, start_at, end_at
       FROM market_portal_popups
       WHERE is_active = 1
         AND (start_at IS NULL OR start_at <= ?)
         AND (end_at IS NULL OR end_at >= ?)
       ORDER BY id DESC
       LIMIT 1`,
      [now, now],
    );
    const popup = rows && rows.length ? rows[0] : null;
    res.json({ popup, kstToday: kstTodayString() });
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
