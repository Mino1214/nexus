import { Router } from "express";
import { z } from "zod";
import { requestSettlementSweep } from "../jobs/settlement.js";
import { requireAuth } from "../middleware/auth.js";
import { createBet, getMyBets, getMyMarketBets } from "../services/betting.js";

const router = Router();

const createBetSchema = z.object({
  market_id: z.string().min(1),
  outcome: z.string().min(1),
  points: z.number().int().positive(),
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    await requestSettlementSweep({ awaitCompletion: true, reason: "route:bets:create" });
    const payload = createBetSchema.parse(req.body);
    const result = await createBet({
      userId: req.authUser!.id,
      marketId: payload.market_id,
      outcome: payload.outcome,
      points: payload.points,
    });
    res.status(201).json(result.response);
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    await requestSettlementSweep({ awaitCompletion: true, reason: "route:bets:me" });
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const result = await getMyBets(req.authUser!.id, { status, page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/market/:marketId", requireAuth, async (req, res, next) => {
  try {
    await requestSettlementSweep({ awaitCompletion: true, reason: "route:bets:market" });
    const result = await getMyMarketBets(req.authUser!.id, String(req.params.marketId));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
