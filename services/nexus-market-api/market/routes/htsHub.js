/**
 * FutureChart Pandora 운영 콘솔 — 마켓 JWT + HTS 모듈 헤더
 * 경로: /api/market/hts/hub/* (index 에서 /hts/hub 로 마운트)
 */
const express = require('express');
const db = require('../../db');
const { requireMarketToken } = require('../middleware');
const { fetchHtsEntitlementForMarketUser } = require('../htsEntitlement');
const { hashPassword } = require('../password');
const { createUniqueOperatorReferralCode, parseSettlementRate } = require('../operatorReferral');

const router = express.Router();
router.use(requireMarketToken);

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

function requireHtsHub(req, res, next) {
  const a = req.marketAuth;
  if (a.role === 'master' || a.role === 'operator') return next();
  if (a.role === 'user') {
    return fetchHtsEntitlementForMarketUser(a.sub, htsModuleSlug(req))
      .then((ent) => {
        if (ent?.canAdmin) return next();
        return res.status(403).json({ error: '운영 콘솔 권한(can_admin)이 없습니다.' });
      })
      .catch((e) => res.status(500).json({ error: e.message }));
  }
  return res.status(403).json({ error: '접근할 수 없습니다.' });
}

function requireHubMaster(req, res, next) {
  const a = req.marketAuth;
  if (a.role === 'master') return next();
  if (a.role === 'user') {
    return fetchHtsEntitlementForMarketUser(a.sub, htsModuleSlug(req))
      .then((ent) => (ent?.canAdmin ? next() : res.status(403).json({ error: '마스터(콘솔) 권한이 필요합니다.' })))
      .catch((e) => res.status(500).json({ error: e.message }));
  }
  return res.status(403).json({ error: '마스터(콘솔) 권한이 필요합니다.' });
}

function notifyScopeKey(req, forMasterRow) {
  const mod = htsModuleSlug(req) || 'hts_future_trade';
  if (forMasterRow) return `m:${mod}`;
  const op = scopedOperatorId(req);
  if (op != null && !Number.isNaN(op)) return `o:${op}:${mod}`;
  return `m:${mod}`;
}

router.use(requireHtsHub);

/** GET /pending-signups */
router.get('/pending-signups', async (req, res) => {
  try {
    const op = scopedOperatorId(req);
    let where = `WHERE u.approval_status = 'pending'`;
    const params = [];
    if (op != null && !Number.isNaN(op)) {
      where += ' AND u.operator_mu_user_id = ?';
      params.push(op);
    }
    const [rows] = await db.pool.query(
      `SELECT u.id, u.operator_mu_user_id, u.market_status, u.created_at,
              mu.login_id AS operator_login, mu.name AS operator_name
       FROM users u
       LEFT JOIN mu_users mu ON mu.id = u.operator_mu_user_id
       ${where}
       ORDER BY u.id DESC
       LIMIT 500`,
      params,
    );
    res.json({ users: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /pending-signups/:id/approve */
router.post('/pending-signups/:id/approve', async (req, res) => {
  try {
    const uid = String(req.params.id || '').trim().toLowerCase();
    const op = scopedOperatorId(req);
    const [[u]] = await db.pool.query(
      `SELECT operator_mu_user_id, approval_status FROM users WHERE id = ? LIMIT 1`,
      [uid],
    );
    if (!u) return res.status(404).json({ error: '유저 없음' });
    if (op != null && Number(u.operator_mu_user_id) !== Number(op)) {
      return res.status(403).json({ error: '소속 회원만 승인할 수 있습니다.' });
    }
    if (String(u.approval_status) !== 'pending') {
      return res.status(400).json({ error: '대기 상태가 아닙니다.' });
    }
    await db.pool.query(`UPDATE users SET approval_status = 'approved' WHERE id = ?`, [uid]);
    await db.pool.query(
      `INSERT INTO market_cash_balance (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /pending-signups/:id/reject */
router.post('/pending-signups/:id/reject', async (req, res) => {
  try {
    const uid = String(req.params.id || '').trim().toLowerCase();
    const op = scopedOperatorId(req);
    const [[u]] = await db.pool.query(
      `SELECT operator_mu_user_id, approval_status FROM users WHERE id = ? LIMIT 1`,
      [uid],
    );
    if (!u) return res.status(404).json({ error: '유저 없음' });
    if (op != null && Number(u.operator_mu_user_id) !== Number(op)) {
      return res.status(403).json({ error: '소속 회원만 거절할 수 있습니다.' });
    }
    if (String(u.approval_status) !== 'pending') {
      return res.status(400).json({ error: '대기 상태가 아닙니다.' });
    }
    await db.pool.query(`DELETE FROM users WHERE id = ? AND approval_status = 'pending'`, [uid]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /operators — 총판 목록 (마스터·can_admin: 전체 / 총판: 본인) */
router.get('/operators', async (req, res) => {
  try {
    const op = scopedOperatorId(req);
    if (op != null && !Number.isNaN(op)) {
    const [rows] = await db.pool.query(
      `SELECT id, name, login_id, role, status, market_role, site_domain, is_site_active,
              referral_code, settlement_rate
       FROM mu_users WHERE id = ? AND market_role = 'operator' LIMIT 1`,
        [op],
      );
      return res.json({ operators: rows });
    }
    const [rows] = await db.pool.query(
      `SELECT id, name, login_id, role, status, market_role, site_domain, is_site_active,
              referral_code, settlement_rate
       FROM mu_users WHERE market_role = 'operator' ORDER BY id DESC LIMIT 500`,
    );
    res.json({ operators: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /operators — 총판 생성 */
router.post('/operators', requireHubMaster, async (req, res) => {
  try {
    const { name, login_id, password, site_domain, settlement_rate } = req.body || {};
    if (!name?.trim() || !login_id?.trim() || !password?.trim()) {
      return res.status(400).json({ error: '이름, 로그인 ID, 비밀번호가 필요합니다.' });
    }
    const domain = site_domain?.trim() || null;
    if (domain) {
      const [[dup]] = await db.pool.query(
        `SELECT id FROM mu_users WHERE site_domain IS NOT NULL AND LOWER(site_domain) = LOWER(?) LIMIT 1`,
        [domain],
      );
      if (dup) return res.status(409).json({ error: '이미 사용 중인 사이트 도메인입니다.' });
    }
    const rate = parseSettlementRate(settlement_rate, 10);
    const ph = hashPassword(password.trim());
    const refCode = await createUniqueOperatorReferralCode(db.pool);
    const [r] = await db.pool.query(
      `INSERT INTO mu_users (name, login_id, password_hash, role, status, market_role, site_domain, is_site_active, referral_code, settlement_rate)
       VALUES (?, ?, ?, 'USER', 'active', 'operator', ?, 1, ?, ?)`,
      [name.trim(), login_id.trim(), ph, domain, refCode, rate],
    );
    res.status(201).json({ ok: true, id: r.insertId, referral_code: refCode, settlement_rate: rate });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '중복된 로그인 ID입니다.' });
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** PATCH /operators/:id */
router.patch('/operators/:id', requireHubMaster, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [[op]] = await db.pool.query(
      `SELECT id FROM mu_users WHERE id = ? AND market_role = 'operator' LIMIT 1`,
      [id],
    );
    if (!op) return res.status(404).json({ error: '운영자를 찾을 수 없습니다.' });

    const { name, password, site_domain, is_site_active, status, settlement_rate } = req.body || {};
    const fields = [];
    const vals = [];
    if (name?.trim()) {
      fields.push('name = ?');
      vals.push(name.trim());
    }
    if (password?.trim()) {
      fields.push('password_hash = ?');
      vals.push(hashPassword(password.trim()));
    }
    if (settlement_rate !== undefined && settlement_rate !== null && settlement_rate !== '') {
      fields.push('settlement_rate = ?');
      vals.push(parseSettlementRate(settlement_rate, 10));
    }
    if (site_domain !== undefined) {
      const domain = site_domain?.trim() || null;
      if (domain) {
        const [[dup]] = await db.pool.query(
          `SELECT id FROM mu_users WHERE LOWER(site_domain) = LOWER(?) AND id <> ? LIMIT 1`,
          [domain, id],
        );
        if (dup) return res.status(409).json({ error: '이미 사용 중인 사이트 도메인입니다.' });
      }
      fields.push('site_domain = ?');
      vals.push(domain);
    }
    if (typeof is_site_active === 'boolean' || is_site_active === 0 || is_site_active === 1) {
      fields.push('is_site_active = ?');
      vals.push(is_site_active ? 1 : 0);
    }
    if (['active', 'inactive'].includes(status)) {
      fields.push('status = ?');
      vals.push(status);
    }
    if (!fields.length) return res.status(400).json({ error: '수정할 필드가 없습니다.' });
    vals.push(id);
    await db.pool.query(`UPDATE mu_users SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /operators/:id */
router.delete('/operators/:id', requireHubMaster, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID입니다.' });
    const [r] = await db.pool.query(`DELETE FROM mu_users WHERE id = ? AND market_role = 'operator'`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '운영자를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** PATCH /managed-users/:id — telegram 등 */
router.patch('/managed-users/:id', async (req, res) => {
  try {
    const uid = String(req.params.id || '').trim().toLowerCase();
    const { telegram, market_status } = req.body || {};
    const op = scopedOperatorId(req);
    const [[u]] = await db.pool.query(`SELECT operator_mu_user_id FROM users WHERE id = ? LIMIT 1`, [uid]);
    if (!u) return res.status(404).json({ error: '유저 없음' });
    if (op != null && Number(u.operator_mu_user_id) !== Number(op)) {
      return res.status(403).json({ error: '소속 유저만 수정할 수 있습니다.' });
    }
    const fields = [];
    const vals = [];
    if (telegram !== undefined) {
      fields.push('telegram = ?');
      vals.push(telegram?.trim() || null);
    }
    if (market_status != null && ['active', 'suspended'].includes(market_status)) {
      fields.push('market_status = ?');
      vals.push(market_status);
    }
    if (!fields.length) return res.status(400).json({ error: '수정할 필드가 없습니다.' });
    vals.push(uid);
    await db.pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /cash-ledger — 캐시 거래·입출금 성격 */
router.get('/cash-ledger', async (req, res) => {
  try {
    const op = scopedOperatorId(req);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    let where = 'WHERE 1=1';
    const params = [];
    if (op != null && !Number.isNaN(op)) {
      where += ' AND u.operator_mu_user_id = ?';
      params.push(op);
    }
    const mod = htsModuleSlug(req);
    if (mod) {
      where += ' AND (t.module_code <=> ? OR t.module_code IS NULL)';
      params.push(mod);
    }
    const [rows] = await db.pool.query(
      `SELECT t.id, t.user_id, t.amount, t.type, t.description, t.module_code, t.created_at,
              u.operator_mu_user_id
       FROM market_cash_transactions t
       INNER JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ${limit}`,
      params,
    );
    res.json({ transactions: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /notify-settings */
router.get('/notify-settings', async (req, res) => {
  try {
    const a = req.marketAuth;
    const forMaster = a.role === 'master' || (a.role === 'user' && (await fetchHtsEntitlementForMarketUser(a.sub, htsModuleSlug(req)))?.canAdmin);
    const key = notifyScopeKey(req, !!forMaster && a.role !== 'operator');
    const [[row]] = await db.pool.query(`SELECT bot_token, chat_deposit, chat_signup FROM hts_hub_notify_settings WHERE scope_key = ? LIMIT 1`, [key]);
    res.json({
      scopeKey: key,
      botToken: row?.bot_token || '',
      chatDeposit: row?.chat_deposit || '',
      chatSignup: row?.chat_signup || '',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** PUT /notify-settings */
router.put('/notify-settings', async (req, res) => {
  try {
    const a = req.marketAuth;
    const forMaster = a.role === 'master' || (a.role === 'user' && (await fetchHtsEntitlementForMarketUser(a.sub, htsModuleSlug(req)))?.canAdmin);
    const key = notifyScopeKey(req, !!forMaster && a.role !== 'operator');
    const { botToken, chatDeposit, chatSignup } = req.body || {};
    await db.pool.query(
      `INSERT INTO hts_hub_notify_settings (scope_key, bot_token, chat_deposit, chat_signup)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE bot_token = VALUES(bot_token), chat_deposit = VALUES(chat_deposit), chat_signup = VALUES(chat_signup)`,
      [key, botToken?.trim() || null, chatDeposit?.trim() || null, chatSignup?.trim() || null],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /notify-settings/test — 자리만 (실제 텔레그램은 추후) */
router.post('/notify-settings/test', async (req, res) => {
  res.json({ ok: true, message: '테스트 전송은 추후 봇 서비스와 연동합니다.' });
});

/** GET /withdrawals */
router.get('/withdrawals', async (req, res) => {
  try {
    const op = scopedOperatorId(req);
    let where = 'WHERE 1=1';
    const params = [];
    if (op != null && !Number.isNaN(op)) {
      where += ' AND w.operator_mu_user_id = ?';
      params.push(op);
    }
    const [rows] = await db.pool.query(
      `SELECT w.*, mu.login_id AS operator_login, mu.name AS operator_name
       FROM hts_operator_withdrawals w
       LEFT JOIN mu_users mu ON mu.id = w.operator_mu_user_id
       ${where}
       ORDER BY w.requested_at DESC
       LIMIT 500`,
      params,
    );
    res.json({ withdrawals: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /withdrawals — 총판 신청 */
router.post('/withdrawals', async (req, res) => {
  try {
    const a = req.marketAuth;
    if (a.role !== 'operator') {
      return res.status(403).json({ error: '총판(운영자)만 출금을 신청할 수 있습니다.' });
    }
    const opId = a.muUserId;
    const { amount, wallet_address } = req.body || {};
    const n = parseInt(amount, 10);
    if (Number.isNaN(n) || n <= 0) return res.status(400).json({ error: '금액이 필요합니다.' });
    const wa = String(wallet_address || '').trim();
    if (!wa) return res.status(400).json({ error: '지갑 주소가 필요합니다.' });
    await db.pool.query(
      `INSERT INTO hts_operator_withdrawals (operator_mu_user_id, amount, wallet_address, status)
       VALUES (?, ?, ?, 'pending')`,
      [opId, n, wa],
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /withdrawals/:id/approve */
router.post('/withdrawals/:id/approve', requireHubMaster, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
    const [r] = await db.pool.query(
      `UPDATE hts_operator_withdrawals SET status = 'approved', processed_at = NOW() WHERE id = ? AND status = 'pending'`,
      [id],
    );
    if (r.affectedRows === 0) return res.status(400).json({ error: '처리할 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /withdrawals/:id/reject */
router.post('/withdrawals/:id/reject', requireHubMaster, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
    const reason = String(req.body?.reason || '').trim() || null;
    const [r] = await db.pool.query(
      `UPDATE hts_operator_withdrawals SET status = 'rejected', reject_reason = ?, processed_at = NOW() WHERE id = ? AND status = 'pending'`,
      [reason, id],
    );
    if (r.affectedRows === 0) return res.status(400).json({ error: '처리할 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
