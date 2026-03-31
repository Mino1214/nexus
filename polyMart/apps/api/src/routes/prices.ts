import { Router } from "express";
import { getPrice, getPriceHistory, getPricesBatch } from "../services/polymarket.js";

const router = Router();

router.get("/history/:tokenId", async (req, res, next) => {
  try {
    const interval = req.query.interval === "1m" || req.query.interval === "1h" || req.query.interval === "1w" ? req.query.interval : "1d";
    const result = await getPriceHistory(req.params.tokenId, interval);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/batch", async (req, res, next) => {
  try {
    const tokenIds = Array.isArray(req.body?.tokenIds) ? req.body.tokenIds.map(String) : [];
    const result = await getPricesBatch(tokenIds);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/:tokenId", async (req, res, next) => {
  try {
    const result = await getPrice(req.params.tokenId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
