function makeReferralCode(size = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < size; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * 총판(mu_users) 전용 레퍼럴 코드. Pandora managers.referral_code 와 동일한 문자 집합.
 * @param {import('mysql2/promise').Pool} pool
 * @param {Set<string>} [reserved]
 */
async function createUniqueOperatorReferralCode(pool, reserved = new Set()) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = makeReferralCode(8);
    if (reserved.has(code)) continue;
    const [[row]] = await pool.query(
      `SELECT id FROM mu_users
       WHERE market_role = 'operator'
         AND (referral_code = ? OR UPPER(TRIM(login_id)) = ?)
       LIMIT 1`,
      [code, code],
    );
    if (!row) return code;
  }
  throw new Error('레퍼럴 코드 생성에 실패했습니다.');
}

/**
 * 가입 시 총판 식별. 로그인 ID 또는 레퍼럴 코드(대소문자 무시).
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} referralInput
 * @returns {Promise<{ id: number } | null>}
 */
async function resolveOperatorByReferral(pool, referralInput) {
  const raw = String(referralInput || '').trim();
  if (!raw) return null;
  const code = raw.toUpperCase();
  const [[row]] = await pool.query(
    `SELECT id FROM mu_users
     WHERE market_role = 'operator' AND status = 'active'
       AND (LOWER(login_id) = LOWER(?) OR UPPER(TRIM(COALESCE(referral_code, ''))) = ?)
     LIMIT 1`,
    [raw, code],
  );
  return row ? { id: Number(row.id) } : null;
}

/** 기존 총판에 비어 있거나 중복인 referral_code 보강 */
async function normalizeOperatorReferralCodes(pool) {
  const [rows] = await pool.query(
    `SELECT id, referral_code, login_id FROM mu_users WHERE market_role = 'operator' ORDER BY id`,
  );
  const used = new Set();
  for (const r of rows) {
    const cur = String(r.referral_code || '').trim().toUpperCase();
    if (cur && !used.has(cur)) {
      used.add(cur);
      continue;
    }
    const next = await createUniqueOperatorReferralCode(pool, used);
    await pool.query('UPDATE mu_users SET referral_code = ? WHERE id = ?', [next, r.id]);
    used.add(next);
  }
}

/** 판도라 managers.settlement_rate 와 동일 — 0~100% */
function parseSettlementRate(v, fallback = 10) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

module.exports = {
  makeReferralCode,
  createUniqueOperatorReferralCode,
  resolveOperatorByReferral,
  normalizeOperatorReferralCodes,
  parseSettlementRate,
};
