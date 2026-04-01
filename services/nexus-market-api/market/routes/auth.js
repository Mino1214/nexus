const express = require('express');
const db = require('../../db');
const { hashPassword, verifyUserStoredPassword } = require('../password');
const { signAccess, signRefresh, verifyRefreshToken } = require('../jwtMarket');
const { saveRefreshToken, consumeRefreshToken, pruneExpiredRefreshTokens } = require('../refreshStore');
const { resolveHtsContextForLogin, fetchHtsEntitlementForMarketUser } = require('../htsEntitlement');
const { verifyAccess } = require('../jwtMarket');
const { requireMarketToken } = require('../middleware');
const { resolveOperatorByReferral } = require('../operatorReferral');

const router = express.Router();

/** Pandora / masterAdmin과 동일. 운영에서는 반드시 .env 로 덮어쓸 것 */
function masterCredentials() {
  return {
    id: process.env.MASTER_ID || 'master666',
    pw: process.env.MASTER_PW || 'master666',
  };
}

/** Pandora admin.html 마스터 레퍼럴과 동일 개념 — 가입 시 안내용 */
function platformMasterReferralDisplay() {
  const fromEnv = process.env.MASTER_REFERRAL_CODE?.trim();
  if (fromEnv) return fromEnv.toUpperCase();
  const { id: MASTER_ID } = masterCredentials();
  return String(MASTER_ID).trim().toUpperCase();
}

/**
 * GET /api/market/auth/login — 브라우저 주소창으로 열면 이것만 보임. 실제 로그인은 POST.
 */
router.get('/login', (_req, res) => {
  res.json({
    ok: false,
    error: 'POST 로 호출하세요.',
    method: 'POST',
    contentType: 'application/json',
    body: { login_id: 'MASTER_ID(환경변수)', password: 'MASTER_PW' },
    ping: '/api/market/ping',
  });
});

const ACCOUNT_ID_REGEX = /^[a-z0-9][a-z0-9_-]{3,19}$/;
const ACCOUNT_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_\-+=\[\]{};:,.?]{8,24}$/;

function normalizeAccountId(value) {
  return String(value || '').trim().toLowerCase();
}

async function isReservedAdminLikeId(normalized) {
  const { id: MASTER_ID } = masterCredentials();
  if (normalized === String(MASTER_ID).trim().toLowerCase()) return true;
  const [[manager]] = await db.pool.query(
    'SELECT id FROM managers WHERE LOWER(id) = LOWER(?) LIMIT 1',
    [normalized],
  );
  return !!manager;
}

async function issueTokensPair(res, payload, subjectType, usersId, muUserId, loginExtra = {}) {
  const { hts = null, displayName: dnExtra = null, referral_code: referralOut = null } = loginExtra;
  const access = signAccess(payload);
  const refresh = signRefresh({ sub: payload.sub, role: payload.role, muUserId: payload.muUserId });
  const expMs = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expMs);
  await saveRefreshToken({
    rawToken: refresh,
    subjectType,
    usersId,
    muUserId,
    expiresAt,
  });
  const displayName =
    dnExtra ||
    (payload.role === 'master' ? 'MASTER' : payload.role === 'operator' ? `운영자 ${payload.sub}` : String(payload.sub));
  const ref = referralOut != null && String(referralOut).trim() !== '' ? String(referralOut).trim() : null;
  res.json({
    accessToken: access,
    refreshToken: refresh,
    role: payload.role,
    sub: payload.sub,
    displayName,
    muUserId: payload.muUserId ?? null,
    operatorMuUserId: payload.operatorMuUserId ?? null,
    ...(hts != null ? { hts } : {}),
    ...(ref ? { referral_code: ref } : {}),
  });
}

/** POST /api/market/auth/register
 *  공개 가입: referral_code 필수(총판 레퍼럴 또는 총판 로그인 ID) → 소속 총판에 승인 대기.
 *  마스터·총판·can_admin Bearer: operator_mu_user_id 등 기존 대로 즉시 승인 가입 가능.
 */
router.post('/register', async (req, res) => {
  try {
    const { id, password, operator_mu_user_id, referral_code } = req.body || {};
    const idError =
      !id?.trim()
        ? '아이디를 입력하세요.'
        : !ACCOUNT_ID_REGEX.test(normalizeAccountId(id))
          ? '아이디 형식이 올바르지 않습니다.'
          : null;
    if (idError) return res.status(400).json({ error: idError });
    if (!password?.trim() || !ACCOUNT_PASSWORD_REGEX.test(String(password))) {
      return res.status(400).json({ error: '비밀번호는 8~24자, 영문과 숫자를 포함해야 합니다.' });
    }

    const newId = normalizeAccountId(id);
    if (await isReservedAdminLikeId(newId)) {
      return res.status(400).json({ error: '사용할 수 없는 아이디입니다.' });
    }

    const [[exists]] = await db.pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [newId]);
    if (exists) return res.status(409).json({ error: '이미 가입된 아이디입니다.' });

    const htsSlugPriv = String(req.headers['x-hts-module'] || process.env.HTS_MODULE_SLUG || 'hts_future_trade').trim();
    let privilegedRegister = false;
    const authHdr = req.headers.authorization;
    if (authHdr?.startsWith('Bearer ')) {
      try {
        const d = verifyAccess(authHdr.slice(7).trim());
        if (d.typ === 'market') {
          if (d.role === 'master' || d.role === 'operator') privilegedRegister = true;
          else if (d.role === 'user') {
            const ent = await fetchHtsEntitlementForMarketUser(d.sub, htsSlugPriv);
            if (ent?.canAdmin) privilegedRegister = true;
          }
        }
      } catch (_e) {
        /* 공개 가입 */
      }
    }

    let opId = null;
    if (privilegedRegister) {
      let rawOp =
        operator_mu_user_id != null && operator_mu_user_id !== ''
          ? parseInt(String(operator_mu_user_id), 10)
          : NaN;
      if (!Number.isNaN(rawOp)) {
        opId = rawOp;
      } else {
        opId = req.marketTenantOperatorId;
      }
      if (opId != null) {
        const [[op]] = await db.pool.query(
          `SELECT id FROM mu_users WHERE id = ? AND market_role = 'operator' LIMIT 1`,
          [opId],
        );
        if (!op) return res.status(400).json({ error: '유효하지 않은 운영자입니다.' });
      }
    } else {
      if (!referral_code?.trim()) {
        return res.status(400).json({
          error: '레퍼럴 코드를 입력하세요. 총판에서 발급된 코드(또는 총판 로그인 ID)가 필요합니다.',
        });
      }
      const resolved = await resolveOperatorByReferral(db.pool, referral_code.trim());
      if (!resolved) {
        return res.status(400).json({ error: '레퍼럴 코드를 찾을 수 없습니다.' });
      }
      opId = resolved.id;
    }

    let approvalStatus = 'approved';
    let issueLoginTokens = true;
    if (opId != null && !privilegedRegister) {
      approvalStatus = 'pending';
      issueLoginTokens = false;
    }

    const pwHash = hashPassword(password.trim());
    await db.pool.query(
      `INSERT INTO users (id, pw, manager_id, telegram, status, owner_id, charge_required_until, operator_mu_user_id, market_status, approval_status)
       VALUES (?, ?, NULL, NULL, 'approved', NULL, NULL, ?, 'active', ?)`,
      [newId, pwHash, opId, approvalStatus],
    );

    await db.pool.query(
      `INSERT INTO market_cash_balance (user_id, balance) VALUES (?, 0)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [newId],
    );

    if (!issueLoginTokens) {
      return res.status(201).json({
        ok: true,
        pendingApproval: true,
        message: '가입 신청이 접수되었습니다. 총판 승인 후 로그인할 수 있습니다.',
      });
    }

    const accessPayload = {
      sub: newId,
      role: 'user',
      muUserId: null,
      operatorMuUserId: opId,
    };
    await issueTokensPair(res, accessPayload, 'user', newId, null, { displayName: newId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/market/auth/login
 *  body: { login_id, password, hts_module_slug?: string }
 *  hts_module_slug 가 있으면 masterAdmin 모듈 권한(master_customer_entitlements)을 검사합니다.
 */
router.post('/login', async (req, res) => {
  try {
    const { login_id, password, hts_module_slug } = req.body || {};
    if (!login_id?.trim() || !password?.trim()) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
    }

    const htsSlug = hts_module_slug != null ? String(hts_module_slug).trim() : '';

    const lid = String(login_id).trim();
    const pw = String(password).trim();
    const { id: MASTER_ID, pw: MASTER_PW } = masterCredentials();

    if (normalizeAccountId(lid) === normalizeAccountId(MASTER_ID) && pw === MASTER_PW) {
      const htsRes = await resolveHtsContextForLogin({
        role: 'master',
        sub: 'master',
        htsModuleSlug: htsSlug,
        displayNameFallback: 'MASTER',
      });
      if (htsRes.error) return res.status(403).json({ error: htsRes.error });
      await issueTokensPair(
        res,
        { sub: 'master', role: 'master', muUserId: null, operatorMuUserId: null },
        'master',
        null,
        null,
        {
          hts: htsRes.hts,
          displayName: htsRes.displayName,
          referral_code: platformMasterReferralDisplay(),
        },
      );
      return;
    }

    const hash = hashPassword(pw);
    const [[mu]] = await db.pool.query(
      `SELECT id, market_role, status, site_domain, referral_code FROM mu_users
       WHERE login_id = ? AND password_hash = ? AND market_role = 'operator' LIMIT 1`,
      [lid, hash],
    );
    if (mu) {
      if (mu.status !== 'active') return res.status(403).json({ error: '비활성 계정입니다.' });
      const htsRes = await resolveHtsContextForLogin({
        role: 'operator',
        sub: String(mu.id),
        htsModuleSlug: htsSlug,
        operatorLoginId: lid,
        displayNameFallback: lid,
      });
      if (htsRes.error) return res.status(403).json({ error: htsRes.error });
      const opRef = mu.referral_code != null && String(mu.referral_code).trim() !== '' ? String(mu.referral_code).trim() : null;
      await issueTokensPair(
        res,
        { sub: String(mu.id), role: 'operator', muUserId: mu.id, operatorMuUserId: mu.id },
        'operator',
        null,
        mu.id,
        {
          hts: htsRes.hts,
          displayName: htsRes.displayName,
          ...(opRef ? { referral_code: opRef } : {}),
        },
      );
      return;
    }

    const uid = normalizeAccountId(lid);
    const [[user]] = await db.pool.query(
      'SELECT id, pw, operator_mu_user_id, market_status, approval_status FROM users WHERE id = ? LIMIT 1',
      [uid],
    );
    if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    if (user.market_status === 'suspended') return res.status(403).json({ error: '정지된 계정입니다.' });
    if (user.approval_status === 'pending') {
      return res.status(403).json({ error: '가입 승인 대기 중입니다. 승인 후 다시 로그인하세요.' });
    }
    if (user.approval_status === 'rejected') {
      return res.status(403).json({ error: '가입이 거절된 계정입니다.' });
    }
    if (!verifyUserStoredPassword(user.pw, pw)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const htsRes = await resolveHtsContextForLogin({
      role: 'user',
      sub: user.id,
      htsModuleSlug: htsSlug,
      displayNameFallback: user.id,
    });
    if (htsRes.error) return res.status(403).json({ error: htsRes.error });

    await issueTokensPair(
      res,
      {
        sub: user.id,
        role: 'user',
        muUserId: null,
        operatorMuUserId: user.operator_mu_user_id,
      },
      'user',
      user.id,
      null,
      { hts: htsRes.hts, displayName: htsRes.displayName },
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/market/auth/me?hts_module_slug=… — 액세스 토큰 + HTS 권한 재확인 */
router.get('/me', requireMarketToken, async (req, res) => {
  try {
    const a = req.marketAuth;
    const slug = String(
      req.query.hts_module_slug || req.headers['x-hts-module'] || req.headers['x-hts-module-slug'] || '',
    ).trim();
    const base = {
      ok: true,
      role: a.role,
      sub: a.sub,
      muUserId: a.muUserId ?? null,
      operatorMuUserId: a.operatorMuUserId ?? null,
    };
    if (!slug) {
      return res.json({
        ...base,
        displayName: a.role === 'master' ? 'MASTER' : String(a.sub),
        hts: null,
      });
    }
    const htsRes = await resolveHtsContextForLogin({
      role: a.role,
      sub: String(a.sub),
      htsModuleSlug: slug,
      operatorLoginId: null,
      displayNameFallback: a.role === 'master' ? 'MASTER' : String(a.sub),
    });
    if (htsRes.error) return res.status(403).json({ error: htsRes.error, ...base });
    return res.json({
      ...base,
      displayName: htsRes.displayName || String(a.sub),
      hts: htsRes.hts,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/market/auth/refresh */
router.post('/refresh', async (req, res) => {
  try {
    await pruneExpiredRefreshTokens();
    const { refreshToken } = req.body || {};
    if (!refreshToken?.trim()) return res.status(400).json({ error: 'refreshToken이 필요합니다.' });

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken.trim());
    } catch (_e) {
      return res.status(401).json({ error: '리프레시 토큰이 유효하지 않습니다.' });
    }
    if (decoded.typ !== 'market_rt') return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });

    const consumed = await consumeRefreshToken(refreshToken.trim());
    if (!consumed) return res.status(401).json({ error: '리프레시 토큰이 이미 사용되었거나 없습니다.' });

    const role = decoded.role;
    const sub = decoded.sub;
    const muUserId = decoded.muUserId ?? null;
    const accessPayload = {
      sub: String(sub),
      role,
      muUserId,
      operatorMuUserId: role === 'operator' ? muUserId : null,
    };

    if (role === 'user') {
      const [[u]] = await db.pool.query(
        'SELECT id, operator_mu_user_id, market_status FROM users WHERE id = ? LIMIT 1',
        [sub],
      );
      if (!u || u.market_status === 'suspended') return res.status(403).json({ error: '계정을 사용할 수 없습니다.' });
      accessPayload.operatorMuUserId = u.operator_mu_user_id;
    }

    const refresh = signRefresh({ sub, role, muUserId });
    const expMs = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + expMs);
    await saveRefreshToken({
      rawToken: refresh,
      subjectType: role,
      usersId: role === 'user' ? sub : null,
      muUserId: role === 'operator' ? muUserId : role === 'master' ? null : null,
      expiresAt,
    });

    res.json({
      accessToken: signAccess(accessPayload),
      refreshToken: refresh,
      role: accessPayload.role,
      sub: String(sub),
      displayName: accessPayload.role === 'master' ? 'MASTER' : String(sub),
      muUserId: accessPayload.muUserId,
      operatorMuUserId: accessPayload.operatorMuUserId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
