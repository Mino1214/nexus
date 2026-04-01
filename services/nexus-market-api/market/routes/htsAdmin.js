/**
 * FutureChart HTS 어드민 — 충전 신청·승인, 소속 유저, 총판(운영자) 목록
 * Authorization: Bearer + X-HTS-Module (또는 서버 HTS_MODULE_SLUG)
 */
const express = require('express');
const db = require('../../db');
const { requireMarketToken } = require('../middleware');
const { fetchHtsEntitlementForMarketUser } = require('../htsEntitlement');

const router = express.Router();

router.use(requireMarketToken);

function needRole(...roles) {
  return (req, res, next) => {
    const r = req.marketAuth?.role;
    if (!roles.includes(r)) return res.status(403).json({ error: '권한이 없습니다.' });
    next();
  };
}

function htsModuleSlug(req) {
  return String(req.headers['x-hts-module'] || process.env.HTS_MODULE_SLUG || 'hts_future_trade').trim();
}

function scopedOperatorId(req) {
  const a = req.marketAuth;
  if (a.role === 'master') return null;
  if (a.role === 'operator') return a.muUserId;
  if (a.role === 'user') return a.operatorMuUserId != null ? Number(a.operatorMuUserId) : null;
  return null;
}

function requireHtsConsole(req, res, next) {
  const a = req.marketAuth;
  if (a.role === 'master' || a.role === 'operator') return next();
  if (a.role === 'user') {
    return fetchHtsEntitlementForMarketUser(a.sub, htsModuleSlug(req))
      .then((ent) => {
        if (ent?.canAdmin) return next();
        return res.status(403).json({ error: 'HTS 콘솔(can_admin) 권한이 없습니다.' });
      })
      .catch((e) => res.status(500).json({ error: e.message }));
  }
  return res.status(403).json({ error: 'HTS 콘솔 접근 불가' });
}

/** POST /hts/charge-request — 일반 유저 */
router.post('/charge-request', needRole('user'), async (req, res) => {
  try {
    const { amount, memo } = req.body || {};
    const n = parseInt(amount, 10);
    if (Number.isNaN(n) || n <= 0) return res.status(400).json({ error: '충전 금액이 필요합니다.' });
    const uid = req.marketAuth.sub;
    const [[u]] = await db.pool.query(
      `SELECT operator_mu_user_id, market_status FROM users WHERE id = ? LIMIT 1`,
      [uid],
    );
    if (!u) return res.status(404).json({ error: '유저 없음' });
    if (u.market_status === 'suspended') return res.status(403).json({ error: '정지된 계정입니다.' });
    const mod = htsModuleSlug(req) || null;
    const [ins] = await db.pool.query(
      `INSERT INTO hts_charge_requests (user_id, amount, memo, status, module_code, operator_mu_user_id)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [uid, n, memo?.trim() || null, mod, u.operator_mu_user_id],
    );
    res.status(201).json({ ok: true, id: ins.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /hts/charge-requests — user: 본인만 / 그 외: 콘솔(마스터·운영자·can_admin) */
router.get('/charge-requests', async (req, res) => {
  try {
    const a = req.marketAuth;
    const mod = htsModuleSlug(req);

    if (a.role === 'user') {
      let where = 'WHERE cr.user_id = ?';
      const params = [a.sub];
      if (mod) {
        where += ' AND (cr.module_code <=> ? OR cr.module_code IS NULL)';
        params.push(mod);
      }
      const [rows] = await db.pool.query(
        `SELECT cr.*, u.telegram AS user_telegram,
                op.name AS operator_name, op.login_id AS operator_login
         FROM hts_charge_requests cr
         LEFT JOIN users u ON u.id = cr.user_id
         LEFT JOIN mu_users op ON op.id = cr.operator_mu_user_id
         ${where}
         ORDER BY cr.id DESC
         LIMIT 200`,
        params,
      );
      return res.json({ requests: rows });
    }

    if (a.role !== 'master' && a.role !== 'operator') {
      const ent = await fetchHtsEntitlementForMarketUser(a.sub, mod);
      if (!ent?.canAdmin) {
        return res.status(403).json({ error: 'HTS 콘솔(can_admin) 권한이 없습니다.' });
      }
    }

    const op = scopedOperatorId(req);
    let where = 'WHERE 1=1';
    const params = [];
    if (mod) {
      where += ' AND (cr.module_code <=> ? OR cr.module_code IS NULL)';
      params.push(mod);
    }
    if (op != null && !Number.isNaN(op)) {
      where += ' AND cr.operator_mu_user_id = ?';
      params.push(op);
    }
    const [rows] = await db.pool.query(
      `SELECT cr.*, u.telegram AS user_telegram,
              op.name AS operator_name, op.login_id AS operator_login
       FROM hts_charge_requests cr
       LEFT JOIN users u ON u.id = cr.user_id
       LEFT JOIN mu_users op ON op.id = cr.operator_mu_user_id
       ${where}
       ORDER BY cr.id DESC
       LIMIT 500`,
      params,
    );
    res.json({ requests: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

async function approveOrReject(req, res, status) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
  const op = scopedOperatorId(req);
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(`SELECT * FROM hts_charge_requests WHERE id = ? FOR UPDATE`, [id]);
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: '없음' });
    }
    if (row.status !== 'pending') {
      await conn.rollback();
      return res.status(400).json({ error: '이미 처리됨' });
    }
    if (op != null && Number(row.operator_mu_user_id) !== Number(op)) {
      await conn.rollback();
      return res.status(403).json({ error: '소속 운영자만 처리할 수 있습니다.' });
    }
    if (status === 'rejected') {
      await conn.query(`UPDATE hts_charge_requests SET status = 'rejected', decided_at = NOW() WHERE id = ?`, [id]);
      await conn.commit();
      return res.json({ ok: true });
    }
    await conn.query(`UPDATE hts_charge_requests SET status = 'approved', decided_at = NOW() WHERE id = ?`, [id]);
    await conn.query(
      `INSERT INTO market_cash_balance (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [row.user_id],
    );
    await conn.query(`UPDATE market_cash_balance SET balance = balance + ? WHERE user_id = ?`, [row.amount, row.user_id]);
    await conn.query(
      `INSERT INTO market_cash_transactions (user_id, amount, type, description, module_code)
       VALUES (?, ?, 'charge', ?, ?)`,
      [row.user_id, row.amount, `HTS 충전 요청 #${id} 승인`, row.module_code],
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (_r) {
      /* ignore */
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
}

router.post('/charge-requests/:id/approve', requireHtsConsole, (req, res) => approveOrReject(req, res, 'approved'));
router.post('/charge-requests/:id/reject', requireHtsConsole, (req, res) => approveOrReject(req, res, 'rejected'));

/** GET /hts/operators — 콘솔용 총판(운영자) 목록 */
router.get('/operators', requireHtsConsole, async (req, res) => {
  try {
    const op = scopedOperatorId(req);
    if (op != null && !Number.isNaN(op)) {
      const [rows] = await db.pool.query(
        `SELECT id, name, login_id, site_domain FROM mu_users WHERE id = ? AND market_role = 'operator' LIMIT 1`,
        [op],
      );
      return res.json({
        operators: rows.map((r) => ({
          id: String(r.id),
          name: r.name || r.login_id || `운영자 ${r.id}`,
          loginId: r.login_id,
          siteDomain: r.site_domain,
        })),
      });
    }
    const [rows] = await db.pool.query(
      `SELECT id, name, login_id, site_domain FROM mu_users WHERE market_role = 'operator' ORDER BY id DESC LIMIT 500`,
    );
    res.json({
      operators: rows.map((r) => ({
        id: String(r.id),
        name: r.name || r.login_id || `운영자 ${r.id}`,
        loginId: r.login_id,
        siteDomain: r.site_domain,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /hts/managed-users */
router.get('/managed-users', requireHtsConsole, async (req, res) => {
  try {
    const op = scopedOperatorId(req);
    let where = 'WHERE u.operator_mu_user_id IS NOT NULL';
    const params = [];
    if (op != null && !Number.isNaN(op)) {
      where += ' AND u.operator_mu_user_id = ?';
      params.push(op);
    }
    const [rows] = await db.pool.query(
      `SELECT u.id, u.telegram, u.status, u.operator_mu_user_id, u.market_status
       FROM users u
       ${where}
       ORDER BY u.id DESC
       LIMIT 2000`,
      params,
    );
    res.json({ users: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** PATCH /hts/managed-users/:id/market-status */
router.patch('/managed-users/:id/market-status', requireHtsConsole, async (req, res) => {
  try {
    const uid = String(req.params.id || '').trim().toLowerCase();
    const { market_status } = req.body || {};
    if (!['active', 'suspended'].includes(market_status)) {
      return res.status(400).json({ error: 'market_status는 active | suspended' });
    }
    const op = scopedOperatorId(req);
    const [[u]] = await db.pool.query(
      `SELECT operator_mu_user_id FROM users WHERE id = ? LIMIT 1`,
      [uid],
    );
    if (!u) return res.status(404).json({ error: '유저 없음' });
    if (op != null && Number(u.operator_mu_user_id) !== Number(op)) {
      return res.status(403).json({ error: '소속 유저만 변경할 수 있습니다.' });
    }
    await db.pool.query(`UPDATE users SET market_status = ? WHERE id = ?`, [market_status, uid]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /hts/positions — 브로커 연동 전 빈 목록 */
router.get('/positions', requireHtsConsole, (_req, res) => {
  res.json({ positions: [] });
});

module.exports = router;
