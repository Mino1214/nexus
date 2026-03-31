import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  createAdminBusinessApiKey,
  createAdminBusinessClient,
  createAdminBusinessReseller,
  createAdminBusinessTemplate,
  getAdminBusinessState,
  getAdminDashboardSnapshot,
  getDatabaseHealth,
  getPersistenceMode,
} from "../db/index.js";
import { getSettlementQueueMode } from "../jobs/settlement.js";
import { getAdminAuthMode, hasExternalAdminSsoConfigured, hasSafeJwtSecret } from "../lib/env.js";
import { badRequest } from "../lib/http.js";
import { getCacheHealth, getCacheMode } from "../services/cache.js";
import { buildAdminBusinessView } from "../services/adminBusiness.js";
import { getMarkets } from "../services/polymarket.js";
import { getAutomatedTemplateSuggestions } from "../services/templateAutomation.js";

const router = Router();

const clientSchema = z.object({
  name: z.string().min(2).max(80),
  company: z.string().min(2).max(120),
  contact: z.string().min(4).max(120),
  resellerId: z.string().min(2).max(64).nullable().optional(),
  templateId: z.string().min(2).max(80).nullable().optional(),
  marketType: z.enum(["yes-no", "multi-candidate"]).default("yes-no"),
  accessTier: z.enum(["starter", "growth", "enterprise"]).default("growth"),
  planName: z.string().min(2).max(80),
  monthlyFee: z.coerce.number().min(0).max(10_000_000_000),
  setupFee: z.coerce.number().min(0).max(10_000_000_000).default(0),
  lossRevenue30d: z.coerce.number().min(0).max(10_000_000_000).default(0),
  allowedMarkets: z.array(z.string().min(1).max(30)).max(12).default(["politics"]),
  customizable: z.boolean().default(true),
  notes: z.string().max(400).default(""),
  contractDays: z.coerce.number().int().min(7).max(3650).default(30),
  status: z.enum(["trial", "active", "paused", "expired"]).default("active"),
});

const apiKeySchema = z.object({
  clientId: z.string().min(2).max(80),
  label: z.string().min(2).max(80),
  scopes: z.array(z.string().min(3).max(40)).min(1).max(12),
  allowedOrigins: z.array(z.string().min(1).max(160)).max(12).default([]),
  allowedIps: z.array(z.string().min(1).max(64)).max(12).default([]),
  rateLimitPerMinute: z.coerce.number().int().min(30).max(50_000).default(120),
  expiryDays: z.coerce.number().int().min(1).max(3650).default(30),
  status: z.enum(["active", "paused", "expired"]).default("active"),
});

const resellerSchema = z.object({
  parentId: z.string().min(2).max(80),
  slot: z.enum(["left", "right"]),
  name: z.string().min(2).max(80),
  code: z.string().min(1).max(20),
  contact: z.string().min(4).max(120),
  shareOfParentPercent: z.coerce.number().min(0.1).max(100),
  status: z.enum(["active", "paused"]).default("active"),
});

const templateSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.string().min(2).max(60),
  marketType: z.enum(["yes-no", "multi-candidate"]).default("yes-no"),
  titlePattern: z.string().min(2).max(100),
  description: z.string().min(8).max(500),
  outcomes: z.array(z.string().min(1).max(40)).min(2).max(8),
  defaultOddsMargin: z.coerce.number().min(0).max(0.5).default(0.07),
  settlementSource: z.string().min(2).max(120),
  designPack: z.string().min(2).max(120),
  customizable: z.boolean().default(true),
  setupFee: z.coerce.number().min(0).max(10_000_000_000).default(0),
  monthlyFee: z.coerce.number().min(0).max(10_000_000_000).default(0),
  status: z.enum(["ready", "custom-only", "archived"]).default("ready"),
  pricingMode: z.enum(["manual", "live-market"]).default("manual"),
  autoPricingEnabled: z.boolean().default(false),
  automationQuery: z.string().max(120).nullable().optional(),
  trackedMarketId: z.string().max(120).nullable().optional(),
  trackedMarketQuestion: z.string().max(240).nullable().optional(),
  refreshSeconds: z.coerce.number().int().min(5).max(3600).default(30),
});

const automationQuerySchema = z.object({
  q: z.string().max(120).optional(),
  marketType: z.enum(["yes-no", "multi-candidate"]).default("yes-no"),
  limit: z.coerce.number().int().min(1).max(6).default(4),
});

function createMaskedPreview(rawKey: string) {
  return `${rawKey.slice(0, 12)}••••${rawKey.slice(-4)}`;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

router.get("/", async (_req, res, next) => {
  try {
    const [state, dashboard, hotMarkets, database, cache] = await Promise.all([
      getAdminBusinessState(),
      getAdminDashboardSnapshot(),
      getMarkets({
        category: "hot",
        sort: "volume24hr",
        page: 1,
        limit: 4,
        q: "",
      }),
      getDatabaseHealth(),
      getCacheHealth(),
    ]);

    const queue = {
      mode: getSettlementQueueMode(),
      ready: getSettlementQueueMode() === "inline" ? true : cache.ready,
    };

    res.json({
      generatedAt: new Date().toISOString(),
      system: {
        database,
        cache: {
          mode: getCacheMode(),
          ready: cache.ready,
          message: cache.message,
        },
        queue,
        persistence: getPersistenceMode(),
        translation: process.env.DEEPL_API_KEY ? "deepl+db" : "manual+db",
        adminAuth: getAdminAuthMode(),
        externalAdminSso: hasExternalAdminSsoConfigured() ? "enabled" : "disabled",
        jwt: hasSafeJwtSecret() ? "custom" : "development-placeholder",
      },
      business: buildAdminBusinessView({
        state,
        dashboard,
        liveMarkets: hotMarkets.items,
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/automation", async (req, res, next) => {
  try {
    const query = automationQuerySchema.parse(req.query);
    const result = await getAutomatedTemplateSuggestions({
      q: query.q,
      marketType: query.marketType,
      limit: query.limit,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/clients", async (req, res, next) => {
  try {
    const payload = clientSchema.parse(req.body);
    const state = await getAdminBusinessState();
    const resellerExists = !payload.resellerId || state.resellers.some((reseller) => reseller.id === payload.resellerId);
    const templateExists = !payload.templateId || state.templates.some((template) => template.id === payload.templateId);

    if (!resellerExists) {
      throw badRequest("Selected reseller does not exist.");
    }

    if (!templateExists) {
      throw badRequest("Selected template does not exist.");
    }

    const client = await createAdminBusinessClient({
      id: `cli_${randomUUID().slice(0, 8)}`,
      name: payload.name,
      company: payload.company,
      contact: payload.contact,
      status: payload.status,
      resellerId: payload.resellerId ?? null,
      templateId: payload.templateId ?? null,
      marketType: payload.marketType,
      accessTier: payload.accessTier,
      planName: payload.planName,
      monthlyFee: payload.monthlyFee,
      setupFee: payload.setupFee,
      lossRevenue30d: payload.lossRevenue30d,
      allowedMarkets: payload.allowedMarkets,
      customizable: payload.customizable,
      notes: payload.notes,
      contractStartedAt: new Date().toISOString(),
      contractEndsAt: daysFromNow(payload.contractDays),
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

router.post("/keys", async (req, res, next) => {
  try {
    const payload = apiKeySchema.parse(req.body);
    const state = await getAdminBusinessState();
    const client = state.clients.find((entry) => entry.id === payload.clientId);
    if (!client) {
      throw badRequest("Selected client does not exist.");
    }

    const rawKey = `pw_${payload.status === "active" ? "live" : "test"}_${randomBytes(18).toString("hex")}`;
    const apiKey = await createAdminBusinessApiKey({
      id: `key_${randomUUID().slice(0, 8)}`,
      clientId: payload.clientId,
      label: payload.label,
      keyPreview: createMaskedPreview(rawKey),
      secretHash: createHash("sha256").update(rawKey).digest("hex"),
      scopes: payload.scopes,
      allowedOrigins: payload.allowedOrigins,
      allowedIps: payload.allowedIps,
      rateLimitPerMinute: payload.rateLimitPerMinute,
      status: payload.status,
      issuedAt: new Date().toISOString(),
      expiresAt: daysFromNow(payload.expiryDays),
      lastUsedAt: null,
    });

    res.status(201).json({
      apiKey: {
        ...apiKey,
        secretHash: undefined,
      },
      plainKey: rawKey,
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/resellers", async (req, res, next) => {
  try {
    const payload = resellerSchema.parse(req.body);
    const state = await getAdminBusinessState();
    const parent = state.resellers.find((reseller) => reseller.id === payload.parentId);

    if (!parent) {
      throw badRequest("Parent reseller does not exist.");
    }

    const sibling = state.resellers.find((reseller) => reseller.parentId === payload.parentId && reseller.slot === payload.slot);
    if (sibling) {
      throw badRequest(`Parent reseller already has a ${payload.slot} branch.`);
    }

    const reseller = await createAdminBusinessReseller({
      id: `res_${randomUUID().slice(0, 8)}`,
      parentId: payload.parentId,
      slot: payload.slot,
      name: payload.name,
      code: payload.code,
      contact: payload.contact,
      shareOfParentPercent: payload.shareOfParentPercent,
      status: payload.status,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ reseller });
  } catch (error) {
    next(error);
  }
});

router.post("/templates", async (req, res, next) => {
  try {
    const payload = templateSchema.parse(req.body);
    const template = await createAdminBusinessTemplate({
      id: `tpl_${randomUUID().slice(0, 8)}`,
      name: payload.name,
      category: payload.category,
      marketType: payload.marketType,
      titlePattern: payload.titlePattern,
      description: payload.description,
      outcomes: payload.outcomes,
      defaultOddsMargin: payload.defaultOddsMargin,
      settlementSource: payload.settlementSource,
      designPack: payload.designPack,
      customizable: payload.customizable,
      setupFee: payload.setupFee,
      monthlyFee: payload.monthlyFee,
      status: payload.status,
      pricingMode: payload.pricingMode,
      autoPricingEnabled: payload.autoPricingEnabled,
      automationQuery: payload.automationQuery ?? null,
      trackedMarketId: payload.trackedMarketId ?? null,
      trackedMarketQuestion: payload.trackedMarketQuestion ?? null,
      refreshSeconds: payload.refreshSeconds,
      updatedAt: new Date().toISOString(),
    });

    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
});

export default router;
