import { Router } from "express";
import { getLeaderboard } from "../services/polymarket.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const window = typeof req.query.window === "string" ? req.query.window : "weekly";
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const result = await getLeaderboard(window, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
