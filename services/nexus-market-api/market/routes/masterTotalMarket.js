/**
 * 총마켓(Master): 판매 모듈 카탈로그 · 마켓 고객 · 모듈별 권한(관리자/운영)
 * 경로: /api/market/master/* (master.js에서 mount, 이미 master JWT 적용됨)
 */
const express = require('express');
const db = require('../../db');
const { hashPassword } = require('../password');

const router = express.Router();

const ACCOUNT_ID_REGEX = /^[a-z0-9][a-z0-9_-]{3,19}$/;
const ACCOUNT_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_\-+=\[\]{};:,.?]{8,24}$/;

function normalizeAccountId(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * GET /module-deployments
 * 구매 고객 × 모듈별 수동 배포 URL/메모 (감사·운영 기록용)
 */
router.get('/module-deployments', async (_req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT
         e.id AS entitlement_id,
         e.customer_id,
         c.display_name AS customer_name,
         c.macro_user_id,
         c.market_user_id,
         c.site_domain AS customer_site_domain,
         e.module_slug,
         m.name AS module_name,
         e.deployment_url,
         e.deployment_notes,
         e.can_admin,
         e.can_operator,
         e.updated_at
       FROM master_customer_entitlements e
       INNER JOIN master_market_customers c ON c.id = e.customer_id
       INNER JOIN master_catalog_modules m ON m.slug = e.module_slug
       ORDER BY e.updated_at DESC, e.id DESC
       LIMIT 1000`,
    );
    res.json({ deployments: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /hub/summary */
router.get('/hub/summary', async (_req, res) => {
  try {
    const [[{ modules }]] = await db.pool.query(
      `SELECT COUNT(*) AS modules FROM master_catalog_modules WHERE is_active = 1`,
    );
    const [[{ customers }]] = await db.pool.query(
      `SELECT COUNT(*) AS customers FROM master_market_customers WHERE status = 'active'`,
    );
    const [[{ entitlements }]] = await db.pool.query(`SELECT COUNT(*) AS entitlements FROM master_customer_entitlements`);
    const [[{ operators }]] = await db.pool.query(
      `SELECT COUNT(*) AS operators FROM mu_users WHERE market_role = 'operator'`,
    );
    res.json({
      hub: {
        activeCatalogModules: Number(modules),
        activeMarketCustomers: Number(customers),
        entitlementGrants: Number(entitlements),
        pandoraOperators: Number(operators),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** --- 카탈로그 모듈 (Pandora, PolyMart 등) --- */
router.get('/catalog/modules', async (_req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT * FROM master_catalog_modules ORDER BY sort_order ASC, id ASC`,
    );
    res.json({ modules: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalog/modules', async (req, res) => {
  try {
    const {
      slug,
      name,
      description,
      sort_order,
      admin_entry_url,
      ops_entry_url,
      is_active,
    } = req.body || {};
    const s = String(slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    if (!s || !name?.trim()) return res.status(400).json({ error: 'slug, name 필요' });
    await db.pool.query(
      `INSERT INTO master_catalog_modules (slug, name, description, sort_order, admin_entry_url, ops_entry_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        s,
        name.trim(),
        description || null,
        sort_order != null ? parseInt(sort_order, 10) : 0,
        admin_entry_url?.trim() || null,
        ops_entry_url?.trim() || null,
        is_active === false || is_active === 0 ? 0 : 1,
      ],
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'slug 중복' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/catalog/modules/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const { name, description, sort_order, admin_entry_url, ops_entry_url, is_active } = req.body || {};
    const fields = [];
    const vals = [];
    if (name?.trim()) {
      fields.push('name = ?');
      vals.push(name.trim());
    }
    if (description !== undefined) {
      fields.push('description = ?');
      vals.push(description);
    }
    if (sort_order != null && !Number.isNaN(parseInt(sort_order, 10))) {
      fields.push('sort_order = ?');
      vals.push(parseInt(sort_order, 10));
    }
    if (admin_entry_url !== undefined) {
      fields.push('admin_entry_url = ?');
      vals.push(admin_entry_url?.trim() || null);
    }
    if (ops_entry_url !== undefined) {
      fields.push('ops_entry_url = ?');
      vals.push(ops_entry_url?.trim() || null);
    }
    if (typeof is_active === 'boolean' || is_active === 0 || is_active === 1) {
      fields.push('is_active = ?');
      vals.push(is_active ? 1 : 0);
    }
    if (!fields.length) return res.status(400).json({ error: '수정 필드 없음' });
    vals.push(slug);
    const [r] = await db.pool.query(`UPDATE master_catalog_modules SET ${fields.join(', ')} WHERE slug = ?`, vals);
    if (r.affectedRows === 0) return res.status(404).json({ error: '모듈 없음' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** --- 마켓 고객 --- */
router.get('/customers', async (_req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM master_customer_entitlements e WHERE e.customer_id = c.id) AS entitlement_count
       FROM master_market_customers c
       ORDER BY c.id DESC LIMIT 500`,
    );
    res.json({ customers: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const { display_name, contact_email, site_domain, notes, macro_user_id, market_user_id, status } = req.body || {};
    if (!display_name?.trim()) return res.status(400).json({ error: 'display_name 필요' });
    const [r] = await db.pool.query(
      `INSERT INTO master_market_customers (display_name, contact_email, site_domain, notes, macro_user_id, market_user_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        display_name.trim(),
        contact_email?.trim() || null,
        site_domain?.trim() || null,
        notes || null,
        macro_user_id?.trim() || null,
        market_user_id?.trim() || null,
        ['active', 'suspended'].includes(status) ? status : 'active',
      ],
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[c]] = await db.pool.query(`SELECT * FROM master_market_customers WHERE id = ?`, [id]);
    if (!c) return res.status(404).json({ error: '고객 없음' });
    res.json({ customer: c });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/customers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { display_name, contact_email, site_domain, notes, macro_user_id, market_user_id, status } = req.body || {};
    const fields = [];
    const vals = [];
    if (display_name?.trim()) {
      fields.push('display_name = ?');
      vals.push(display_name.trim());
    }
    if (contact_email !== undefined) {
      fields.push('contact_email = ?');
      vals.push(contact_email?.trim() || null);
    }
    if (site_domain !== undefined) {
      fields.push('site_domain = ?');
      vals.push(site_domain?.trim() || null);
    }
    if (notes !== undefined) {
      fields.push('notes = ?');
      vals.push(notes);
    }
    if (macro_user_id !== undefined) {
      fields.push('macro_user_id = ?');
      vals.push(macro_user_id?.trim() || null);
    }
    if (market_user_id !== undefined) {
      fields.push('market_user_id = ?');
      vals.push(market_user_id?.trim() || null);
    }
    if (['active', 'suspended'].includes(status)) {
      fields.push('status = ?');
      vals.push(status);
    }
    if (!fields.length) return res.status(400).json({ error: '수정 필드 없음' });
    vals.push(id);
    const [r] = await db.pool.query(`UPDATE master_market_customers SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (r.affectedRows === 0) return res.status(404).json({ error: '고객 없음' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/customers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.pool.query(`DELETE FROM master_customer_entitlements WHERE customer_id = ?`, [id]);
    const [r] = await db.pool.query(`DELETE FROM master_market_customers WHERE id = ?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '고객 없음' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /customers/:id/entitlements */
router.get('/customers/:id/entitlements', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await db.pool.query(`SELECT * FROM master_customer_entitlements WHERE customer_id = ?`, [id]);
    const [mods] = await db.pool.query(`SELECT slug, name, admin_entry_url, ops_entry_url FROM master_catalog_modules WHERE is_active = 1 ORDER BY sort_order`);
    res.json({ entitlements: rows, catalog: mods });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /customers/:id/provision-market-user
 * 마켓플레이스용 users 행 생성·연결 (가입 불가 id 예: master666 도 Master 가 여기서만 발급)
 * body: { login_id, password, update_password?: bool — 기존 유저면 비밀번호 갱신 여부 }
 */
router.post('/customers/:id/provision-market-user', async (req, res) => {
  try {
    const cid = parseInt(req.params.id, 10);
    const { login_id, password, update_password } = req.body || {};
    const newId = normalizeAccountId(login_id);
    if (!ACCOUNT_ID_REGEX.test(newId)) {
      return res.status(400).json({ error: '아이디는 소문자·숫자·_- 만 4~20자, 첫 글자는 문자/숫자' });
    }
    if (!password?.trim() || !ACCOUNT_PASSWORD_REGEX.test(String(password))) {
      return res.status(400).json({ error: '비밀번호 8~24자, 영문과 숫자 포함' });
    }

    const [[cust]] = await db.pool.query(`SELECT id FROM master_market_customers WHERE id = ?`, [cid]);
    if (!cust) return res.status(404).json({ error: '고객 없음' });

    const [[existing]] = await db.pool.query(`SELECT id FROM users WHERE id = ? LIMIT 1`, [newId]);
    const pwHash = hashPassword(password.trim());

    if (existing) {
      if (update_password) {
        await db.pool.query(`UPDATE users SET pw = ? WHERE id = ?`, [pwHash, newId]);
      }
    } else {
      await db.pool.query(
        `INSERT INTO users (id, pw, manager_id, telegram, status, owner_id, charge_required_until, operator_mu_user_id, market_status)
         VALUES (?, ?, NULL, NULL, 'approved', NULL, NULL, NULL, 'active')`,
        [newId, pwHash],
      );
      await db.pool.query(
        `INSERT INTO market_cash_balance (user_id, balance) VALUES (?, 0)
         ON DUPLICATE KEY UPDATE user_id = user_id`,
        [newId],
      );
    }

    await db.pool.query(`UPDATE master_market_customers SET market_user_id = ? WHERE id = ?`, [newId, cid]);
    res.json({
      ok: true,
      login_id: newId,
      created: !existing,
      passwordUpdated: !!existing && !!update_password,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /customers/:id/entitlements
 * body: { items: [ { module_slug, can_admin, can_operator, flags_json?, deployment_url?, deployment_notes? } ] }
 */
router.put('/customers/:id/entitlements', async (req, res) => {
  const conn = await db.pool.getConnection();
  try {
    const id = parseInt(req.params.id, 10);
    const { items } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items 배열 필요' });

    const [[cust]] = await conn.query(`SELECT id FROM master_market_customers WHERE id = ?`, [id]);
    if (!cust) return res.status(404).json({ error: '고객 없음' });

    await conn.beginTransaction();
    await conn.query(`DELETE FROM master_customer_entitlements WHERE customer_id = ?`, [id]);

    for (const it of items) {
      const slug = String(it.module_slug || '')
        .trim()
        .toLowerCase();
      if (!slug) continue;
      const [[exists]] = await conn.query(`SELECT slug FROM master_catalog_modules WHERE slug = ? LIMIT 1`, [slug]);
      if (!exists) continue;
      const canA = it.can_admin === false || it.can_admin === 0 ? 0 : 1;
      const canO = it.can_operator === false || it.can_operator === 0 ? 0 : 1;
      let flags = it.flags_json;
      if (flags != null && typeof flags === 'object') flags = JSON.stringify(flags);
      const depUrl = it.deployment_url != null ? String(it.deployment_url).trim() || null : null;
      const depNotes = it.deployment_notes != null ? String(it.deployment_notes).trim() || null : null;
      await conn.query(
        `INSERT INTO master_customer_entitlements (customer_id, module_slug, can_admin, can_operator, flags_json, deployment_url, deployment_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, slug, canA, canO, flags != null ? String(flags) : null, depUrl, depNotes],
      );
    }

    await conn.commit();
    const [rows] = await db.pool.query(`SELECT * FROM master_customer_entitlements WHERE customer_id = ?`, [id]);
    res.json({ ok: true, entitlements: rows });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (_r) {
      /* */
    }
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
