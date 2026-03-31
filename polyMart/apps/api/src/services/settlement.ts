import { listPendingBets, settleMarketBets } from "../db/index.js";
import { getMarket } from "./polymarket.js";

let running = false;

export async function settlePendingBets() {
  if (running) {
    return { settled: 0, skipped: true };
  }

  running = true;

  try {
    const pendingBets = await listPendingBets();
    const expiredMarkets = [...new Set(
      pendingBets
        .filter((bet) => bet.marketEndDate && new Date(bet.marketEndDate).getTime() <= Date.now())
        .map((bet) => bet.marketId),
    )];

    let settled = 0;

    for (const marketId of expiredMarkets) {
      const market = await getMarket(marketId);
      if (!market.closed || !market.resolution) {
        continue;
      }

      settled += await settleMarketBets(marketId, market.resolution, new Date().toISOString());
    }

    return { settled, skipped: false };
  } finally {
    running = false;
  }
}
