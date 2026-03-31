import { Router } from "express";
import { requestSettlementSweep } from "../jobs/settlement.js";

const router = Router();

router.post("/", async (_req, res, next) => {
  try {
    const result = await requestSettlementSweep({ awaitCompletion: true, reason: "route:settle" });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
