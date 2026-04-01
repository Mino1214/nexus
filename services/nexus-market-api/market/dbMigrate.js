/**
 * cursor-spec 기반 마켓 플랫폼 테이블 (MariaDB)
 */

const SAFE_TABLE = /^[a-zA-Z0-9_]+$/;
async function columnExists(pool, table, col) {
  if (!SAFE_TABLE.test(table) || !SAFE_TABLE.test(col)) return false;
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [col]);
  return rows.length > 0;
}

/**
 * masterAdmin 총판 허브에 보이는 데모 고객 + 모듈 배포 URL + HTS 로그인용 users.id.
 * contact_email 이 이미 있으면 고객 INSERT 만 스킵하고 연결·권한은 보강합니다.
 */
async function seedNexusHubDemo(pool) {
  const MARKER_EMAIL = 'demo-tenant@nexus.local';
  const SEED_NOTE = 'SEED:nexus-hub-demo-v1';
  try {
    const { hashPassword } = require('./password');
    const userPwHash = hashPassword('HtsDemo12');
    const opPwHash = hashPassword('OpDemo12');

    let customerId;
    const [[custRow]] = await pool.query(
      'SELECT id FROM master_market_customers WHERE contact_email = ? LIMIT 1',
      [MARKER_EMAIL],
    );
    if (!custRow) {
      const [ins] = await pool.query(
        `INSERT INTO master_market_customers (display_name, contact_email, site_domain, notes, status, macro_user_id, market_user_id)
         VALUES (?, ?, ?, ?, 'active', NULL, NULL)`,
        ['데모 테넌트 (Pandora·FutureChart)', MARKER_EMAIL, 'demo-tenant.nexus.local', SEED_NOTE],
      );
      customerId = ins.insertId;
      console.log('[market DB] nexus 허브 데모 고객 생성 id=', customerId);
    } else {
      customerId = custRow.id;
    }

    let opId;
    const [[opRow]] = await pool.query(
      `SELECT id FROM mu_users WHERE login_id = ? AND market_role = 'operator' LIMIT 1`,
      ['demo_op'],
    );
    if (!opRow) {
      const [oins] = await pool.query(
        `INSERT INTO mu_users (name, login_id, password_hash, role, status, market_role, site_domain, is_site_active)
         VALUES (?, ?, ?, 'USER', 'active', 'operator', ?, 1)`,
        ['데모 총판(Pandora)', 'demo_op', opPwHash, 'demo-tenant.nexus.local'],
      );
      opId = oins.insertId;
      console.log('[market DB] nexus 데모 운영자 demo_op id=', opId);
    } else {
      opId = opRow.id;
    }

    const [[uRow]] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', ['htsdemo']);
    if (!uRow) {
      await pool.query(
        `INSERT INTO users (id, pw, manager_id, telegram, status, owner_id, charge_required_until, operator_mu_user_id, market_status)
         VALUES (?, ?, NULL, NULL, 'approved', NULL, NULL, ?, 'active')`,
        ['htsdemo', userPwHash, opId],
      );
      await pool.query(
        `INSERT INTO market_cash_balance (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE user_id = user_id`,
        ['htsdemo'],
      );
      console.log('[market DB] nexus 데모 마켓 유저 htsdemo / 비밀번호 HtsDemo12');
    }

    await pool.query(`UPDATE master_market_customers SET market_user_id = ? WHERE id = ?`, ['htsdemo', customerId]);

    await pool.query(
      `INSERT IGNORE INTO master_customer_entitlements
        (customer_id, module_slug, can_admin, can_operator, flags_json, deployment_url, deployment_notes)
       VALUES
        (?, 'pandora', 1, 1, NULL, 'http://127.0.0.1:3000', 'services/macro-server — admin.html'),
        (?, 'hts_future_trade', 1, 1, NULL, 'http://127.0.0.1:5180', 'FutureChart Vite'),
        (?, 'polymart', 1, 0, NULL, NULL, '선택 모듈')`,
      [
        customerId,
        customerId,
        customerId,
      ],
    );
  } catch (e) {
    console.warn('[market DB] nexus 허브 데모 시드:', e.message);
  }
}

async function runMarketMigrations(pool) {
  // users 테넌시·상태
  try {
    if (!(await columnExists(pool, 'users', 'operator_mu_user_id'))) {
      await pool.query(
        'ALTER TABLE users ADD COLUMN operator_mu_user_id INT NULL DEFAULT NULL COMMENT \'소속 운영자 mu_users.id\'',
      );
      await pool.query('ALTER TABLE users ADD INDEX idx_users_operator_mu (operator_mu_user_id)');
      console.log('[market DB] users.operator_mu_user_id 추가');
    }
  } catch (e) {
    console.error('[market DB] users.operator_mu_user_id:', e.message);
  }

  try {
    if (!(await columnExists(pool, 'users', 'market_status'))) {
      await pool.query(
        "ALTER TABLE users ADD COLUMN market_status ENUM('active','suspended') NOT NULL DEFAULT 'active'",
      );
      console.log('[market DB] users.market_status 추가');
    }
  } catch (e) {
    console.error('[market DB] users.market_status:', e.message);
  }

  // mu_users: 운영자/마스터(선택) 마켓 메타
  try {
    if (!(await columnExists(pool, 'mu_users', 'market_role'))) {
      await pool.query(
        'ALTER TABLE mu_users ADD COLUMN market_role VARCHAR(20) NULL DEFAULT NULL COMMENT \'master|operator\'',
      );
      console.log('[market DB] mu_users.market_role 추가');
    }
  } catch (e) {
    console.error('[market DB] mu_users.market_role:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'mu_users', 'site_domain'))) {
      await pool.query(
        'ALTER TABLE mu_users ADD COLUMN site_domain VARCHAR(255) NULL DEFAULT NULL',
      );
      console.log('[market DB] mu_users.site_domain 추가');
    }
  } catch (e) {
    console.error('[market DB] mu_users.site_domain:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'mu_users', 'is_site_active'))) {
      await pool.query(
        'ALTER TABLE mu_users ADD COLUMN is_site_active TINYINT(1) NOT NULL DEFAULT 0',
      );
      console.log('[market DB] mu_users.is_site_active 추가');
    }
  } catch (e) {
    console.error('[market DB] mu_users.is_site_active:', e.message);
  }
  try {
    const [idx] = await pool.query(
      "SHOW INDEX FROM mu_users WHERE Key_name = 'idx_mu_users_site_domain'",
    );
    if (idx.length === 0) {
      await pool.query('CREATE INDEX idx_mu_users_site_domain ON mu_users (site_domain)');
    }
  } catch (e) {
    console.warn('[market DB] mu_users site_domain index:', e.message);
  }

  try {
    if (!(await columnExists(pool, 'mu_users', 'referral_code'))) {
      await pool.query(
        `ALTER TABLE mu_users ADD COLUMN referral_code VARCHAR(20) NULL DEFAULT NULL COMMENT '총판 레퍼럴(가입 필수, Pandora managers.referral_code 와 동일 역할)'`,
      );
      console.log('[market DB] mu_users.referral_code 추가');
    }
  } catch (e) {
    console.error('[market DB] mu_users.referral_code:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'mu_users', 'settlement_rate'))) {
      await pool.query(
        `ALTER TABLE mu_users ADD COLUMN settlement_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00 COMMENT '마스터 설정 정산 비율(%) — 판도라 정산관리 settlement_rate'`,
      );
      console.log('[market DB] mu_users.settlement_rate 추가');
    }
  } catch (e) {
    console.error('[market DB] mu_users.settlement_rate:', e.message);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_points (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      amount INT NOT NULL,
      type VARCHAR(30) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_market_points_user (user_id),
      INDEX idx_market_points_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_cash_balance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL UNIQUE,
      balance INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_market_cash_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_cash_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      amount INT NOT NULL,
      type VARCHAR(30) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mct_user_time (user_id, created_at),
      INDEX idx_mct_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_point_convert_policy (
      id INT AUTO_INCREMENT PRIMARY KEY,
      operator_mu_user_id INT NULL DEFAULT NULL,
      monthly_limit INT NOT NULL DEFAULT 50000,
      convert_rate DECIMAL(5,2) NOT NULL DEFAULT 1.00,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_policy_operator_mu (operator_mu_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      checked_date DATE NOT NULL,
      points_earned INT NOT NULL DEFAULT 100,
      streak_count INT NOT NULL DEFAULT 1,
      UNIQUE KEY uq_market_attendance_user_date (user_id, checked_date),
      INDEX idx_market_att_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_videos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      thumbnail_url VARCHAR(500) DEFAULT NULL,
      title VARCHAR(200) DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      review_stage VARCHAR(20) NOT NULL DEFAULT 'operator',
      points_earned INT NOT NULL DEFAULT 0,
      reviewed_by_mu_user_id INT NULL DEFAULT NULL,
      reviewed_at DATETIME NULL DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_market_vid_user (user_id),
      INDEX idx_market_vid_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_mini_game_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      game_type VARCHAR(50) NOT NULL,
      score INT NOT NULL DEFAULT 0,
      points_earned INT NOT NULL,
      played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mmg_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category VARCHAR(50) DEFAULT NULL,
      operator_mu_user_id INT NULL DEFAULT NULL,
      price_cash INT NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT -1,
      is_visible TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_market_prod_operator (operator_mu_user_id),
      INDEX idx_market_prod_visible (is_visible)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      product_id INT NOT NULL,
      operator_mu_user_id INT NULL DEFAULT NULL,
      quantity INT NOT NULL DEFAULT 1,
      total_cash INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mord_user (user_id),
      INDEX idx_mord_operator (operator_mu_user_id),
      INDEX idx_mord_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      subject_type VARCHAR(20) NOT NULL,
      users_id VARCHAR(50) NULL,
      mu_user_id INT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mrt_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 기본 전역 정책 (operator NULL 대신 0 행 — id=1 operator_mu_user_id NULL)
  try {
    const [[cnt]] = await pool.query('SELECT COUNT(*) AS c FROM market_point_convert_policy');
    if (Number(cnt.c) === 0) {
      await pool.query(
        'INSERT INTO market_point_convert_policy (operator_mu_user_id, monthly_limit, convert_rate) VALUES (NULL, 50000, 1.00)',
      );
      console.log('[market DB] 기본 point_convert_policy 삽입');
    }
  } catch (e) {
    console.warn('[market DB] policy seed:', e.message);
  }

  /** 총마켓: 판매 모듈 카탈로그 + 고객 + 모듈별 권한(플래그) */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_catalog_modules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(64) NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      admin_entry_url VARCHAR(500) DEFAULT NULL,
      ops_entry_url VARCHAR(500) DEFAULT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_master_cat_slug (slug),
      INDEX idx_master_cat_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_market_customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      display_name VARCHAR(200) NOT NULL,
      contact_email VARCHAR(255) DEFAULT NULL,
      site_domain VARCHAR(255) DEFAULT NULL,
      notes TEXT,
      macro_user_id VARCHAR(50) DEFAULT NULL COMMENT 'Pandora users.id 등 연결',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mmc_email (contact_email),
      INDEX idx_mmc_macro_user (macro_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_customer_entitlements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      module_slug VARCHAR(64) NOT NULL,
      can_admin TINYINT(1) NOT NULL DEFAULT 1,
      can_operator TINYINT(1) NOT NULL DEFAULT 1,
      flags_json TEXT,
      deployment_url VARCHAR(500) DEFAULT NULL COMMENT '구매자 제공 URL(전체 경로 또는 도메인)',
      deployment_notes VARCHAR(500) DEFAULT NULL COMMENT '수동 배포 메모',
      granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cust_module (customer_id, module_slug),
      INDEX idx_ent_customer (customer_id),
      INDEX idx_ent_slug (module_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  try {
    if (!(await columnExists(pool, 'master_customer_entitlements', 'deployment_url'))) {
      await pool.query(
        "ALTER TABLE master_customer_entitlements ADD COLUMN deployment_url VARCHAR(500) DEFAULT NULL COMMENT '구매자 제공 URL'",
      );
      console.log('[market DB] master_customer_entitlements.deployment_url 추가');
    }
  } catch (e) {
    console.error('[market DB] deployment_url:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'master_customer_entitlements', 'deployment_notes'))) {
      await pool.query(
        'ALTER TABLE master_customer_entitlements ADD COLUMN deployment_notes VARCHAR(500) DEFAULT NULL COMMENT \'수동 배포 메모\'',
      );
      console.log('[market DB] master_customer_entitlements.deployment_notes 추가');
    }
  } catch (e) {
    console.error('[market DB] deployment_notes:', e.message);
  }

  try {
    if (!(await columnExists(pool, 'master_market_customers', 'market_user_id'))) {
      await pool.query(
        "ALTER TABLE master_market_customers ADD COLUMN market_user_id VARCHAR(50) DEFAULT NULL COMMENT 'marketPlace users.id'",
      );
      try {
        const [idx] = await pool.query(
          "SHOW INDEX FROM master_market_customers WHERE Key_name = 'idx_mmc_market_user'",
        );
        if (idx.length === 0) {
          await pool.query(
            'CREATE INDEX idx_mmc_market_user ON master_market_customers (market_user_id)',
          );
        }
      } catch (_ie) {
        /* ignore */
      }
      console.log('[market DB] master_market_customers.market_user_id 추가');
    }
  } catch (e) {
    console.error('[market DB] market_user_id:', e.message);
  }

  try {
    if (!(await columnExists(pool, 'master_catalog_modules', 'thumbnail_url'))) {
      await pool.query(
        'ALTER TABLE master_catalog_modules ADD COLUMN thumbnail_url VARCHAR(500) DEFAULT NULL COMMENT \'카드 썸네일\'',
      );
      console.log('[market DB] master_catalog_modules.thumbnail_url 추가');
    }
  } catch (e) {
    console.error('[market DB] thumbnail_url:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'master_catalog_modules', 'detail_markdown'))) {
      await pool.query(
        'ALTER TABLE master_catalog_modules ADD COLUMN detail_markdown MEDIUMTEXT DEFAULT NULL COMMENT \'상세 설명(마크다운)\'',
      );
      console.log('[market DB] master_catalog_modules.detail_markdown 추가');
    }
  } catch (e) {
    console.error('[market DB] detail_markdown:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'master_catalog_modules', 'gallery_json'))) {
      await pool.query(
        "ALTER TABLE master_catalog_modules ADD COLUMN gallery_json MEDIUMTEXT DEFAULT NULL COMMENT '[{type,url}] JSON'",
      );
      console.log('[market DB] master_catalog_modules.gallery_json 추가');
    }
  } catch (e) {
    console.error('[market DB] gallery_json:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'master_catalog_modules', 'body_html'))) {
      await pool.query(
        'ALTER TABLE master_catalog_modules ADD COLUMN body_html MEDIUMTEXT DEFAULT NULL COMMENT \'총마켓 상품 본문 HTML\'',
      );
      console.log('[market DB] master_catalog_modules.body_html 추가');
    }
  } catch (e) {
    console.error('[market DB] body_html:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'market_products', 'price_points'))) {
      await pool.query(
        'ALTER TABLE market_products ADD COLUMN price_points INT NOT NULL DEFAULT 0 COMMENT \'포인트 가격\'',
      );
      console.log('[market DB] market_products.price_points 추가');
    }
  } catch (e) {
    console.error('[market DB] price_points:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'market_products', 'payment_mode'))) {
      await pool.query(
        "ALTER TABLE market_products ADD COLUMN payment_mode VARCHAR(20) NOT NULL DEFAULT 'both' COMMENT 'cash_only|points_only|both'",
      );
      console.log('[market DB] market_products.payment_mode 추가');
    }
  } catch (e) {
    console.error('[market DB] payment_mode:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'market_orders', 'payment_kind'))) {
      await pool.query(
        "ALTER TABLE market_orders ADD COLUMN payment_kind VARCHAR(20) NOT NULL DEFAULT 'cash' COMMENT 'cash|points'",
      );
      console.log('[market DB] market_orders.payment_kind 추가');
    }
  } catch (e) {
    console.error('[market DB] payment_kind:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'market_orders', 'total_points'))) {
      await pool.query(
        'ALTER TABLE market_orders ADD COLUMN total_points INT NOT NULL DEFAULT 0',
      );
      console.log('[market DB] market_orders.total_points 추가');
    }
  } catch (e) {
    console.error('[market DB] total_points:', e.message);
  }
  try {
    if (!(await columnExists(pool, 'market_videos', 'is_featured'))) {
      await pool.query(
        'ALTER TABLE market_videos ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0',
      );
      await pool.query(
        'ALTER TABLE market_videos ADD COLUMN featured_sort INT NOT NULL DEFAULT 0',
      );
      await pool.query(
        'ALTER TABLE market_videos ADD COLUMN show_on_home TINYINT(1) NOT NULL DEFAULT 1 COMMENT \'홈 노출\'',
      );
      console.log('[market DB] market_videos 포털 컬럼 추가');
    }
  } catch (e) {
    console.error('[market DB] market_videos portal:', e.message);
  }

  /** 총마켓 포털 팝업 */
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_portal_popups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        body_html MEDIUMTEXT DEFAULT NULL,
        image_url VARCHAR(500) DEFAULT NULL,
        link_url VARCHAR(500) DEFAULT NULL,
        link_text VARCHAR(50) DEFAULT NULL,
        start_at DATETIME DEFAULT NULL,
        end_at DATETIME DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_mpp_active (is_active),
        INDEX idx_mpp_window (start_at, end_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) {
    console.error('[market DB] market_portal_popups:', e.message);
  }

  try {
    await pool.query(
      `INSERT IGNORE INTO master_catalog_modules (slug, name, description, sort_order, admin_entry_url, ops_entry_url, is_active)
       VALUES
         ('pandora', 'Pandora (macro-server)', '레거시 HTTP 앱 — 저장소 services/macro-server', 10, '/admin.html', '/owner.html', 1),
         ('polymart', 'PolyMart / Polywatch', '폴리마켓 연동 웹/API 모듈', 20, NULL, NULL, 1),
         ('hts_future_trade', 'FutureTrade HTS', '선물 HTS 운영 API — market_* 공용 테이블 + module_code', 15, NULL, NULL, 1)`,
    );
  } catch (e) {
    console.warn('[market DB] master catalog seed:', e.message);
  }

  /**
   * 고객 권한 탭·GET /master/customers/:id/entitlements 의 catalog 는
   * master_catalog_modules WHERE is_active=1 만 노출한다.
   * 기존 DB 에 hts_future_trade 행이 없거나 꺼져 있으면 FutureTrade 가 안 보이므로 upsert 로 고정한다.
   */
  try {
    await pool.query(
      `INSERT INTO master_catalog_modules (slug, name, description, sort_order, admin_entry_url, ops_entry_url, is_active)
       VALUES ('hts_future_trade', 'FutureTrade HTS', '선물 HTS — Pandora·FutureChart (VITE_HTS_MODULE_SLUG, module_code)', 12, NULL, NULL, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         description = VALUES(description),
         sort_order = VALUES(sort_order),
         is_active = 1`,
    );
    console.log('[market DB] master_catalog_modules: hts_future_trade 보강(고객 권한 탭 노출)');
  } catch (e) {
    console.warn('[market DB] hts_future_trade upsert:', e.message);
  }

  try {
    await pool.query(
      `UPDATE master_catalog_modules SET name = ?, description = ? WHERE slug = 'pandora'`,
      ['Pandora (macro-server)', '레거시 HTTP 앱 — 저장소 services/macro-server'],
    );
  } catch (_e) {
    /* ignore */
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hts_charge_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      amount INT NOT NULL,
      memo VARCHAR(500) DEFAULT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      module_code VARCHAR(64) DEFAULT NULL,
      operator_mu_user_id INT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decided_at DATETIME DEFAULT NULL,
      INDEX idx_hts_cr_user (user_id),
      INDEX idx_hts_cr_status (status),
      INDEX idx_hts_cr_op (operator_mu_user_id),
      INDEX idx_hts_cr_module (module_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  /** 레거시 hts_charge_requests (초기 스키마만 있는 경우) 컬럼 보강 — 없으면 GET /hts/charge-requests 가 500 */
  try {
    if (!(await columnExists(pool, 'hts_charge_requests', 'module_code'))) {
      await pool.query(
        `ALTER TABLE hts_charge_requests ADD COLUMN module_code VARCHAR(64) DEFAULT NULL COMMENT '서비스 모듈(slug)'`,
      );
      console.log('[market DB] hts_charge_requests.module_code 추가');
    }
    if (!(await columnExists(pool, 'hts_charge_requests', 'operator_mu_user_id'))) {
      await pool.query(
        `ALTER TABLE hts_charge_requests ADD COLUMN operator_mu_user_id INT DEFAULT NULL`,
      );
      const [opIx] = await pool.query(`SHOW INDEX FROM hts_charge_requests WHERE Key_name = 'idx_hts_cr_op'`);
      if (opIx.length === 0) {
        await pool.query('CREATE INDEX idx_hts_cr_op ON hts_charge_requests (operator_mu_user_id)');
      }
      console.log('[market DB] hts_charge_requests.operator_mu_user_id 추가');
    }
    const [htsIx] = await pool.query(`SHOW INDEX FROM hts_charge_requests WHERE Key_name = 'idx_hts_cr_module'`);
    if (htsIx.length === 0) {
      await pool.query('CREATE INDEX idx_hts_cr_module ON hts_charge_requests (module_code)');
    }
  } catch (e) {
    console.warn('[market DB] hts_charge_requests 컬럼 보강:', e.message);
  }

  /** 동일 DB·다른 서비스(FutureTrade HTS 등) 구분용 — 조회 시 module_code 로 필터 */
  const moduleCols = [
    ['market_cash_transactions', 'module_code', 'idx_mct_module'],
    ['market_points', 'module_code', 'idx_mp_module'],
  ];
  for (const [table, col, idxName] of moduleCols) {
    try {
      if (!(await columnExists(pool, table, col))) {
        await pool.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` VARCHAR(64) NULL DEFAULT NULL COMMENT '서비스 모듈(slug), 예: hts_future_trade'`,
        );
        console.log(`[market DB] ${table}.${col} 추가`);
      }
      const [ixrows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [idxName]);
      if (ixrows.length === 0) {
        await pool.query(`CREATE INDEX \`${idxName}\` ON \`${table}\` (\`${col}\`)`);
        console.log(`[market DB] ${table} 인덱스 ${idxName}`);
      }
    } catch (e) {
      console.error(`[market DB] ${table}.${col}:`, e.message);
    }
  }

  /** users.id 와 VARCHAR user_id 컬럼 collation 불일치 시 Illegal mix of collations 방지 */
  try {
    const [[urow]] = await pool.query(
      `SELECT COLLATION_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1`,
    );
    const coll = urow?.c && /^utf8mb4_[a-z0-9_]+$/i.test(urow.c) ? urow.c : 'utf8mb4_unicode_ci';
    const syncPairs = [
      ['market_points', 'user_id'],
      ['market_cash_balance', 'user_id'],
      ['market_cash_transactions', 'user_id'],
      ['market_videos', 'user_id'],
      ['market_attendance', 'user_id'],
      ['market_orders', 'user_id'],
      ['market_mini_game_logs', 'user_id'],
      ['market_refresh_tokens', 'users_id'],
      /** LEFT JOIN users u ON u.id = cr.user_id — collation 불일치 시 Illegal mix of collations → 500 */
      ['hts_charge_requests', 'user_id'],
    ];
    for (const [table, col] of syncPairs) {
      const [[t]] = await pool.query(
        `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table],
      );
      if (!t || Number(t.n) === 0) continue;
      const [[ci]] = await pool.query(
        `SELECT IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH AS maxlen FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col],
      );
      if (!ci) continue;
      const [[ccol]] = await pool.query(
        `SELECT COLLATION_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col],
      );
      if (String(ccol?.c || '').toLowerCase() === String(coll).toLowerCase()) continue;
      const len = Math.min(191, Math.max(50, Number(ci.maxlen) || 50));
      const nullSql = ci.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
      await pool.query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN \`${col}\` VARCHAR(${len}) CHARACTER SET utf8mb4 COLLATE ${coll} ${nullSql}`,
      );
    }
    console.log(`[market DB] user_id 계열 collation 동기화 (${coll})`);
  } catch (e) {
    console.warn('[market DB] user_id collation sync:', e.message);
  }

  try {
    if (!(await columnExists(pool, 'users', 'approval_status'))) {
      await pool.query(
        `ALTER TABLE users ADD COLUMN approval_status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved' COMMENT '총판 소속 가입 승인'`,
      );
      console.log('[market DB] users.approval_status 추가');
    }
  } catch (e) {
    console.error('[market DB] users.approval_status:', e.message);
  }

  try {
    if (!(await columnExists(pool, 'users', 'created_at'))) {
      await pool.query(
        `ALTER TABLE users ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      );
      console.log('[market DB] users.created_at 추가');
    }
  } catch (e) {
    console.error('[market DB] users.created_at:', e.message);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hts_operator_withdrawals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      operator_mu_user_id INT NOT NULL,
      amount INT NOT NULL,
      wallet_address VARCHAR(200) NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      reject_reason VARCHAR(500) DEFAULT NULL,
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME DEFAULT NULL,
      INDEX idx_how_op (operator_mu_user_id),
      INDEX idx_how_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hts_hub_notify_settings (
      scope_key VARCHAR(96) NOT NULL PRIMARY KEY,
      bot_token VARCHAR(220) DEFAULT NULL,
      chat_deposit VARCHAR(64) DEFAULT NULL,
      chat_signup VARCHAR(64) DEFAULT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await seedNexusHubDemo(pool);

  try {
    const { normalizeOperatorReferralCodes } = require('./operatorReferral');
    await normalizeOperatorReferralCodes(pool);
    const [refIdx] = await pool.query("SHOW INDEX FROM mu_users WHERE Key_name = 'uq_mu_users_referral_code'");
    if (refIdx.length === 0) {
      await pool.query('CREATE UNIQUE INDEX uq_mu_users_referral_code ON mu_users (referral_code)');
      console.log('[market DB] mu_users.referral_code UNIQUE 인덱스');
    }
  } catch (e) {
    console.warn('[market DB] 총판 레퍼럴 정규화/UNIQUE:', e.message);
  }

  console.log('[market DB] 마이그레이션 완료');
}

module.exports = { runMarketMigrations };
