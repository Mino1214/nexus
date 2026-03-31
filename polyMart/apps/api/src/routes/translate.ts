import { Router } from "express";
import { isLanguageCode } from "@polywatch/shared";
import { z } from "zod";
import { getMarket } from "../services/polymarket.js";
import { getTranslationList, saveManualTranslation, translateMarket } from "../services/translator.js";

const router = Router();
const translationSchema = z.object({
  question: z.string().min(1).max(500),
  description: z.string().max(10_000).default(""),
});

router.get("/:marketId", async (req, res, next) => {
  try {
    const lang = typeof req.query.lang === "string" && isLanguageCode(req.query.lang) ? req.query.lang : "ko";
    const market = await getMarket(req.params.marketId);
    const translation = await translateMarket(
      {
        id: market.id,
        question: market.question,
        description: market.description ?? "",
      },
      lang,
    );

    res.json({
      marketId: market.id,
      lang,
      translation,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  if (!req.baseUrl.includes("/admin/translations")) {
    res.status(404).json({
      message: "Translation list endpoint is only available under /api/admin/translations.",
    });
    return;
  }

  try {
    const lang = typeof req.query.lang === "string" && isLanguageCode(req.query.lang) ? req.query.lang : undefined;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const result = await getTranslationList({ lang, page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.put("/:marketId/:lang", async (req, res, next) => {
  if (!req.baseUrl.includes("/admin/translations")) {
    res.status(404).json({
      message: "Translation edit endpoint is only available under /api/admin/translations.",
    });
    return;
  }

  try {
    const lang = typeof req.params.lang === "string" && isLanguageCode(req.params.lang) ? req.params.lang : null;
    if (!lang || lang === "en") {
      res.status(400).json({
        message: "Manual translations are only supported for ko, ja, and zh.",
      });
      return;
    }

    const payload = translationSchema.parse(req.body);
    const result = await saveManualTranslation({
      marketId: req.params.marketId,
      lang,
      question: payload.question,
      description: payload.description,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
