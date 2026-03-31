import { Router } from "express";
import { isCategoryId, isLanguageCode, isSortOptionId } from "@polywatch/shared";
import { getMarket, getMarkets, searchMarkets } from "../services/polymarket.js";
import { attachMarketTranslations, translateMarket } from "../services/translator.js";

const router = Router();

router.get("/search", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const lang = typeof req.query.lang === "string" && isLanguageCode(req.query.lang) ? req.query.lang : "ko";
    const result = await searchMarkets(q, page, limit);
    const items = await attachMarketTranslations(result.items, lang);
    res.json({
      ...result,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const category = typeof req.query.category === "string" && isCategoryId(req.query.category) ? req.query.category : "hot";
    const sort = typeof req.query.sort === "string" && isSortOptionId(req.query.sort) ? req.query.sort : "volume24hr";
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(40, Math.max(1, Number(req.query.limit ?? 20)));
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const lang = typeof req.query.lang === "string" && isLanguageCode(req.query.lang) ? req.query.lang : "ko";

    const result = await getMarkets({
      category,
      sort,
      page,
      limit,
      q,
    });

    const items = await attachMarketTranslations(result.items, lang);

    res.json({
      ...result,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const lang = typeof req.query.lang === "string" && isLanguageCode(req.query.lang) ? req.query.lang : "ko";
    const market = await getMarket(req.params.id);
    const translation = await translateMarket(
      {
        id: market.id,
        question: market.question,
        description: market.description ?? "",
      },
      lang,
    );

    res.json({
      ...market,
      translation,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
