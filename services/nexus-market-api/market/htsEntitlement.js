const db = require('../db');

/**
 * masterAdmin: 고객(master_market_customers) + 모듈 권한(master_customer_entitlements)
 * market_user_id 가 로그인한 users.id 와 일치할 때만 행이 잡힘.
 */
async function fetchHtsEntitlementForMarketUser(marketUserId, moduleSlug) {
  const uid = String(marketUserId || '').trim();
  const slug = String(moduleSlug || '').trim();
  if (!uid || !slug) return null;

  const [[row]] = await db.pool.query(
    `SELECT mmc.id AS customer_id,
            mmc.display_name AS customer_name,
            e.can_admin AS can_admin,
            e.can_operator AS can_operator,
            e.flags_json AS flags_json
     FROM master_market_customers mmc
     INNER JOIN master_customer_entitlements e
       ON e.customer_id = mmc.id AND e.module_slug = ?
     INNER JOIN master_catalog_modules m ON m.slug = e.module_slug AND m.is_active = 1
     WHERE mmc.market_user_id = ?
       AND (mmc.status = 'active' OR mmc.status IS NULL OR mmc.status = '')
     LIMIT 1`,
    [slug, uid],
  );

  if (!row) return null;
  return {
    customerId: Number(row.customer_id),
    customerName: row.customer_name ? String(row.customer_name) : null,
    moduleSlug: slug,
    canAdmin: Number(row.can_admin) === 1,
    canOperator: Number(row.can_operator) === 1,
    flagsJson: row.flags_json ? String(row.flags_json) : null,
  };
}

/**
 * @param {object} p
 * @param {'master'|'operator'|'user'} p.role
 * @param {string} p.sub JWT subject (users.id 또는 'master' 또는 mu_user id 문자열)
 * @param {string|null} p.htsModuleSlug — 요청 body 의 hts_module_slug
 * @param {string} [p.operatorLoginId] — 운영자 로그인 표시용
 * @returns {Promise<{ hts: object|null, error?: string, displayName?: string }>}
 */
async function resolveHtsContextForLogin(p) {
  const slug = String(p.htsModuleSlug || '').trim();
  if (!slug) {
    return { hts: null, displayName: p.displayNameFallback || undefined };
  }

  if (p.role === 'master') {
    return {
      hts: {
        moduleSlug: slug,
        kind: 'platform_master',
        canAdmin: true,
        canOperator: true,
        customerId: null,
        customerName: null,
        flagsJson: null,
      },
      displayName: 'MASTER',
    };
  }

  if (p.role === 'operator') {
    return {
      hts: {
        moduleSlug: slug,
        kind: 'operator',
        canAdmin: false,
        canOperator: true,
        customerId: null,
        customerName: null,
        flagsJson: null,
      },
      displayName: p.operatorLoginId ? String(p.operatorLoginId) : `운영자 ${p.sub}`,
    };
  }

  const ent = await fetchHtsEntitlementForMarketUser(p.sub, slug);
  if (ent) {
    if (!ent.canAdmin && !ent.canOperator) {
      return { error: '모듈 권한(can_admin / can_operator)이 비어 있습니다. masterAdmin에서 권한을 저장하세요.' };
    }
    return {
      hts: { kind: 'customer_user', ...ent },
      displayName: ent.customerName || p.sub,
    };
  }

  /**
   * 레퍼럴 가입 후 승인된 일반 유저: master_market_customers 행 없이도 HTS 로그인·차트 사용
   * (총판 소속 operator_mu_user_id + 승인된 계정)
   */
  const [[u]] = await db.pool.query(
    `SELECT id, approval_status, market_status, operator_mu_user_id FROM users WHERE id = ? LIMIT 1`,
    [p.sub],
  );
  const appr = u ? String(u.approval_status || 'approved') : '';
  if (
    u &&
    u.operator_mu_user_id != null &&
    String(u.market_status || 'active') !== 'suspended' &&
    appr !== 'pending' &&
    appr !== 'rejected'
  ) {
    return {
      hts: {
        kind: 'market_user',
        moduleSlug: slug,
        canAdmin: false,
        canOperator: false,
        customerId: null,
        customerName: null,
        flagsJson: null,
      },
      displayName: String(u.id),
    };
  }

  return {
    error:
      '이 HTS 모듈에 대한 사용 권한이 없습니다. 총판 소속 가입 승인 여부·또는 masterAdmin 고객·모듈 권한을 확인하세요.',
  };
}

module.exports = {
  fetchHtsEntitlementForMarketUser,
  resolveHtsContextForLogin,
};
