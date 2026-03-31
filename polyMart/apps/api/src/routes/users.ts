import { Router } from "express";
import { POINT_RULES } from "@polywatch/shared";
import { z } from "zod";
import { awardDailyLogin } from "../db/index.js";
import { requestSettlementSweep } from "../jobs/settlement.js";
import { requireAuth } from "../middleware/auth.js";
import { createAuthResponse, exchangeExternalAdminToken, getMePayload, loginUser, signupUser, toAuthUser } from "../services/auth.js";

const router = Router();

const signupSchema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  lang: z.enum(["ko", "ja", "zh", "en"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email().optional(),
  identifier: z.string().min(3).max(100).optional(),
  password: z.string().min(6).max(100),
}).refine((value) => Boolean(value.identifier || value.email), {
  message: "Identifier is required.",
});

const externalExchangeSchema = z.object({
  token: z.string().min(20),
});

router.post("/auth/signup", async (req, res, next) => {
  try {
    const payload = signupSchema.parse(req.body);
    const result = await signupUser(payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const result = await loginUser({
      identifier: payload.identifier ?? payload.email ?? "",
      password: payload.password,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/auth/external/exchange", async (req, res, next) => {
  try {
    const payload = externalExchangeSchema.parse(req.body);
    const result = await exchangeExternalAdminToken(payload.token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", requireAuth, (_req, res) => {
  res.status(204).send();
});

router.get("/users/me", requireAuth, async (req, res, next) => {
  try {
    await requestSettlementSweep({ awaitCompletion: true, reason: "route:users:me" });
    const result = await getMePayload(req.authUser!.id, {
      adminOverride: req.authContext?.adminRole ? true : undefined,
      authSource: req.authContext?.authSource,
      adminRole: req.authContext?.adminRole,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/users/daily-login", requireAuth, async (req, res, next) => {
  try {
    const user = req.authUser!;
    const today = new Date().toISOString().slice(0, 10);
    const result = await awardDailyLogin(user.id, today, POINT_RULES.daily_login);

    res.json({
      awarded: result.awarded,
      user: toAuthUser(result.user),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
