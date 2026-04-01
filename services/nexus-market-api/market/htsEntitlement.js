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
  if (!ent) {
    return {
      error:
        '이 HTS 모듈에 대한 사용 권한이 없습니다. masterAdmin에서 고객 등록·모듈 권한(총판/관리)·마켓 유저 발급을 확인하세요.',
    };
  }
  if (!ent.canAdmin && !ent.canOperator) {
    return { error: '모듈 권한(can_admin / can_operator)이 비어 있습니다. masterAdmin에서 권한을 저장하세요.' };
  }

  return {
    hts: { kind: 'customer_user', ...ent },
    displayName: ent.customerName || p.sub,
  };
}

module.exports = {
  fetchHtsEntitlementForMarketUser,
  resolveHtsContextForLogin,
};
