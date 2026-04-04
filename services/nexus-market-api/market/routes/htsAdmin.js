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

/** GET /hts/charge-requests — user(canAdmin 없음): 본인만 / 그 외: 콘솔 전체 */
router.get('/charge-requests', async (req, res) => {
  try {
    const a = req.marketAuth;
    const mod = htsModuleSlug(req);

    if (a.role === 'user') {
      // canAdmin 권한이 있으면 master/operator 와 동일하게 전체 목록을 반환
      const ent = await fetchHtsEntitlementForMarketUser(a.sub, mod);
      if (!ent?.canAdmin) {
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
      // canAdmin=true → 아래 전체 목록 쿼리로 fall-through
    } else if (a.role !== 'master' && a.role !== 'operator') {
      const ent = await fetchHtsEntitlementForMarketUser(a.sub, mod);
      if (!ent?.canAdmin) {
        return res.status(403).json({ error: 'HTS 콘솔(can_admin) 권한이 없습니다.' });
      }
    }

    // canAdmin 유저는 master 처럼 전체 조회 (operator 필터 없음)
    const op = a.role === 'user' ? null : scopedOperatorId(req);
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
    console.error('[hts/charge-requests GET]', e.code || '', e.message);
    res.status(500).json({ error: e.message });
  }
});

async function approveOrReject(req, res, status) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 ID' });
  // canAdmin 유저(role=user + canAdmin)는 master처럼 operator 제한 없이 처리
  const a = req.marketAuth;
  const op = a.role === 'user' ? null : scopedOperatorId(req);
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
    const search = req.query.search ? String(req.query.search).trim() : null;
    const opFilter = req.query.operator_id ? parseInt(req.query.operator_id, 10) : null;

    let where = 'WHERE u.operator_mu_user_id IS NOT NULL';
    const params = [];
    if (op != null && !Number.isNaN(op)) {
      where += ' AND u.operator_mu_user_id = ?';
      params.push(op);
    } else if (opFilter != null && !Number.isNaN(opFilter)) {
      where += ' AND u.operator_mu_user_id = ?';
      params.push(opFilter);
    }
    if (search) {
      where += ' AND u.id LIKE ?';
      params.push(`%${search}%`);
    }
    const [rows] = await db.pool.query(
      `SELECT u.id, u.telegram, u.status, u.operator_mu_user_id, u.market_status, u.created_at,
              mu.name AS operator_name, mu.login_id AS operator_login
       FROM users u
       LEFT JOIN mu_users mu ON mu.id = u.operator_mu_user_id
       ${where}
       ORDER BY u.operator_mu_user_id ASC, u.id ASC
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

/* ─────────────────────────────────────────────
   환율 / 잔액 / 전환 API
───────────────────────────────────────────── */

/** 환율 캐시 (10분) */
let _rateCache = { rate: null, at: 0 };

async function getKrwPerUsd() {
  if (_rateCache.rate && Date.now() - _rateCache.at < 10 * 60 * 1000) return _rateCache.rate;
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=KRW');
    const j = await r.json();
    const rate = j?.rates?.KRW;
    if (rate && rate > 0) {
      _rateCache = { rate, at: Date.now() };
      return rate;
    }
  } catch (_) {}
  // fallback: 캐시 값 있으면 재사용, 없으면 기본값
  return _rateCache.rate || 1380;
}

/** GET /hts/exchange-rate — 현재 USD/KRW 환율 */
router.get('/exchange-rate', needRole('user', 'operator', 'master'), async (_req, res) => {
  try {
    const rate = await getKrwPerUsd();
    res.json({ usdKrw: rate, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 잔액 조회 헬퍼 */
async function getFullBalance(uid) {
  const [[row]] = await db.pool.query(
    `SELECT balance, usdt_balance FROM market_cash_balance WHERE user_id = ? LIMIT 1`,
    [uid],
  );
  return { krw: row ? Number(row.balance) : 0, usdt: row ? Number(row.usdt_balance || 0) : 0 };
}

/** GET /hts/balance — KRW + USDT 잔액 */
router.get('/balance', needRole('user'), async (req, res) => {
  try {
    const uid = req.marketAuth.sub;
    const bal = await getFullBalance(uid);
    const rate = await getKrwPerUsd();
    res.json({ ...bal, usdKrw: rate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /hts/convert — KRW ↔ USDT 전환 */
router.post('/convert', needRole('user'), async (req, res) => {
  const { from, amount } = req.body || {};
  if (!['KRW', 'USDT'].includes(from)) return res.status(400).json({ error: 'from은 KRW 또는 USDT' });
  const n = parseFloat(amount);
  if (!n || n <= 0) return res.status(400).json({ error: '금액 오류' });

  const uid = req.marketAuth.sub;
  const rate = await getKrwPerUsd();
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();

    // 잔액 row 없으면 생성
    await conn.query(
      `INSERT INTO market_cash_balance (user_id, balance, usdt_balance) VALUES (?, 0, 0)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid],
    );
    const [[bal]] = await conn.query(
      `SELECT balance, usdt_balance FROM market_cash_balance WHERE user_id = ? FOR UPDATE`,
      [uid],
    );

    let fromAmt, toAmt, toCurrency;
    if (from === 'KRW') {
      fromAmt = Math.round(n);
      if (Number(bal.balance) < fromAmt) throw Object.assign(new Error('KRW 잔액 부족'), { status: 400 });
      toAmt = parseFloat((fromAmt / rate).toFixed(6));
      toCurrency = 'USDT';
      await conn.query(
        `UPDATE market_cash_balance SET balance = balance - ?, usdt_balance = usdt_balance + ? WHERE user_id = ?`,
        [fromAmt, toAmt, uid],
      );
    } else {
      fromAmt = parseFloat(n.toFixed(6));
      if (Number(bal.usdt_balance) < fromAmt) throw Object.assign(new Error('USDT 잔액 부족'), { status: 400 });
      toAmt = Math.round(fromAmt * rate);
      toCurrency = 'KRW';
      await conn.query(
        `UPDATE market_cash_balance SET usdt_balance = usdt_balance - ?, balance = balance + ? WHERE user_id = ?`,
        [fromAmt, toAmt, uid],
      );
    }

    await conn.query(
      `INSERT INTO hts_exchange_conversions (user_id, from_currency, from_amount, to_currency, to_amount, rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uid, from, fromAmt, toCurrency, toAmt, rate],
    );

    await conn.commit();
    const newBal = await getFullBalance(uid);
    res.json({ ok: true, from, fromAmt, toCurrency, toAmt, rate, ...newBal });
  } catch (e) {
    await conn.rollback();
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

/** POST /hts/charge-request — currency 지원 (KRW / USDT) */
// 기존 라우트에 currency 필드 추가를 위해 패치
router.post('/charge-request-v2', needRole('user'), async (req, res) => {
  try {
    const { amount, memo, currency = 'KRW' } = req.body || {};
    if (!['KRW', 'USDT'].includes(currency)) return res.status(400).json({ error: '통화 오류' });
    const n = currency === 'USDT' ? parseFloat(parseFloat(amount).toFixed(6)) : parseInt(amount, 10);
    if (!n || n <= 0) return res.status(400).json({ error: '충전 금액이 필요합니다.' });
    const uid = req.marketAuth.sub;
    const [[u]] = await db.pool.query(
      `SELECT operator_mu_user_id, market_status FROM users WHERE id = ? LIMIT 1`,
      [uid],
    );
    if (!u) return res.status(404).json({ error: '유저 없음' });
    if (u.market_status === 'suspended') return res.status(403).json({ error: '정지된 계정입니다.' });
    const mod = htsModuleSlug(req) || null;
    const [ins] = await db.pool.query(
      `INSERT INTO hts_charge_requests (user_id, amount, currency, memo, status, module_code, operator_mu_user_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [uid, n, currency, memo?.trim() || null, mod, u.operator_mu_user_id],
    );
    res.status(201).json({ ok: true, id: ins.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
