import type { PolyMarket } from "@polywatch/shared";
import type { AdminDashboardSnapshot } from "../db/types.js";
import type { AdminBusinessState, ApiBusinessClientRecord, ApiBusinessKeyRecord, ApiBusinessResellerRecord } from "../db/businessTypes.js";

interface ResellerTreeNode extends ApiBusinessResellerRecord {
  effectiveSharePercent: number;
  retainedSharePercent: number;
  subtreeLossRevenue30d: number;
  estimatedRetainedRevenue30d: number;
  directClientCount: number;
  subtreeClientCount: number;
  apiKeyCount: number;
  children: ResellerTreeNode[];
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function sortByDateDesc<T extends { createdAt?: string; issuedAt?: string; updatedAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftValue = new Date(left.createdAt ?? left.issuedAt ?? left.updatedAt ?? 0).getTime();
    const rightValue = new Date(right.createdAt ?? right.issuedAt ?? right.updatedAt ?? 0).getTime();
    return rightValue - leftValue;
  });
}

function sanitizeKey(record: ApiBusinessKeyRecord) {
  const { secretHash: _secretHash, ...safe } = record;
  return safe;
}

function computeResellerTree(state: AdminBusinessState) {
  const clientMap = new Map(state.clients.map((client) => [client.id, client]));
  const keysByClient = new Map<string, number>();
  for (const key of state.apiKeys) {
    keysByClient.set(key.clientId, (keysByClient.get(key.clientId) ?? 0) + 1);
  }

  const clientsByReseller = new Map<string, ApiBusinessClientRecord[]>();
  for (const client of state.clients) {
    if (!client.resellerId) {
      continue;
    }

    const bucket = clientsByReseller.get(client.resellerId) ?? [];
    bucket.push(client);
    clientsByReseller.set(client.resellerId, bucket);
  }

  const childrenByParent = new Map<string | null, ApiBusinessResellerRecord[]>();
  for (const reseller of state.resellers) {
    const bucket = childrenByParent.get(reseller.parentId) ?? [];
    bucket.push(reseller);
    childrenByParent.set(reseller.parentId, bucket);
  }

  for (const bucket of childrenByParent.values()) {
    bucket.sort((left, right) => {
      const slotOrder = { left: 0, right: 1, root: -1 };
      return slotOrder[left.slot] - slotOrder[right.slot] || left.code.localeCompare(right.code, "ko");
    });
  }

  function walk(node: ApiBusinessResellerRecord, parentEffectiveSharePercent: number): ResellerTreeNode {
    const effectiveSharePercent = node.parentId ? parentEffectiveSharePercent * (node.shareOfParentPercent / 100) : 100;
    const childNodes = (childrenByParent.get(node.id) ?? []).map((child) => walk(child, effectiveSharePercent));
    const directClients = clientsByReseller.get(node.id) ?? [];
    const directLossRevenue30d = directClients.reduce((sum, client) => sum + Number(client.lossRevenue30d ?? 0), 0);
    const childLossRevenue30d = childNodes.reduce((sum, child) => sum + child.subtreeLossRevenue30d, 0);
    const childEffectiveShare = childNodes.reduce((sum, child) => sum + child.effectiveSharePercent, 0);
    const retainedSharePercent = Math.max(0, effectiveSharePercent - childEffectiveShare);
    const directClientCount = directClients.length;
    const subtreeClientCount = directClientCount + childNodes.reduce((sum, child) => sum + child.subtreeClientCount, 0);
    const apiKeyCount = directClients.reduce((sum, client) => sum + (keysByClient.get(client.id) ?? 0), 0)
      + childNodes.reduce((sum, child) => sum + child.apiKeyCount, 0);
    const subtreeLossRevenue30d = directLossRevenue30d + childLossRevenue30d;

    return {
      ...node,
      effectiveSharePercent: round(effectiveSharePercent),
      retainedSharePercent: round(retainedSharePercent),
      subtreeLossRevenue30d,
      estimatedRetainedRevenue30d: round(subtreeLossRevenue30d * (retainedSharePercent / 100)),
      directClientCount,
      subtreeClientCount,
      apiKeyCount,
      children: childNodes,
    };
  }

  const root = (childrenByParent.get(null) ?? [])[0] ?? null;
  const tree = root ? walk(root, 100) : null;
  const flat: ResellerTreeNode[] = [];

  function flatten(node: ResellerTreeNode | null) {
    if (!node) {
      return;
    }

    flat.push(node);
    node.children.forEach(flatten);
  }

  flatten(tree);

  return {
    tree,
    flat,
    orphanClients: state.clients.filter((client) => client.resellerId && !state.resellers.some((reseller) => reseller.id === client.resellerId)),
    knownClients: Array.from(clientMap.values()).length,
  };
}

function mapLiveMarket(market: PolyMarket) {
  let outcomes: string[] = [];
  let outcomePrices: Array<number | string> = [];

  try {
    outcomes = Array.isArray(market.outcomes) ? market.outcomes as string[] : JSON.parse(String(market.outcomes ?? "[]"));
  } catch {}

  try {
    outcomePrices = Array.isArray(market.outcomePrices) ? market.outcomePrices as Array<number | string> : JSON.parse(String(market.outcomePrices ?? "[]"));
  } catch {}

  return {
    id: market.id,
    question: market.translation?.question ?? market.question,
    slug: market.slug ?? null,
    volume24h: Number(market.volume24hr ?? 0),
    liquidity: Number(market.liquidityNum ?? market.liquidity ?? 0),
    endDate: market.endDate ?? null,
    outcomes: outcomes.map((label, index) => ({
      label,
      price: Number(outcomePrices[index] ?? 0),
    })),
  };
}

export function buildAdminBusinessView(params: {
  state: AdminBusinessState;
  dashboard: AdminDashboardSnapshot;
  liveMarkets: PolyMarket[];
}) {
  const { state, dashboard, liveMarkets } = params;
  const reseller = computeResellerTree(state);
  const now = Date.now();
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;
  const activeClients = state.clients.filter((client) => client.status === "active");
  const activeKeys = state.apiKeys.filter((key) => key.status === "active");

  const expiringSoonClients = state.clients.filter((client) => {
    const expiresAt = new Date(client.contractEndsAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt >= now && expiresAt <= now + twoWeeks;
  });
  const expiringSoonKeys = state.apiKeys.filter((key) => {
    const expiresAt = new Date(key.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt >= now && expiresAt <= now + twoWeeks;
  });

  return {
    summary: {
      activeClients: activeClients.length,
      activeKeys: activeKeys.length,
      expiringSoon: expiringSoonClients.length + expiringSoonKeys.length,
      monthlyRecurringRevenue: activeClients.reduce((sum, client) => sum + Number(client.monthlyFee ?? 0), 0),
      setupRevenueBacklog: state.clients
        .filter((client) => client.status === "trial" || client.customizable)
        .reduce((sum, client) => sum + Number(client.setupFee ?? 0), 0),
      lossRevenue30d: state.clients.reduce((sum, client) => sum + Number(client.lossRevenue30d ?? 0), 0),
      masterRetainedRevenue30d: reseller.tree?.estimatedRetainedRevenue30d ?? 0,
      activeResellers: state.resellers.filter((node) => node.status === "active").length,
      customTemplates: state.templates.filter((template) => template.customizable).length,
    },
    clients: sortByDateDesc(state.clients).map((client) => ({
      ...client,
      apiKeyCount: state.apiKeys.filter((key) => key.clientId === client.id).length,
      resellerName: state.resellers.find((resellerNode) => resellerNode.id === client.resellerId)?.name ?? "직접",
      templateName: state.templates.find((template) => template.id === client.templateId)?.name ?? "미지정",
      daysRemaining: Math.max(0, Math.ceil((new Date(client.contractEndsAt).getTime() - now) / (24 * 60 * 60 * 1000))),
    })),
    apiKeys: sortByDateDesc(state.apiKeys).map((key) => ({
      ...sanitizeKey(key),
      clientName: state.clients.find((client) => client.id === key.clientId)?.name ?? "알 수 없음",
      clientCompany: state.clients.find((client) => client.id === key.clientId)?.company ?? "알 수 없음",
      expiresInDays: Math.max(0, Math.ceil((new Date(key.expiresAt).getTime() - now) / (24 * 60 * 60 * 1000))),
    })),
    templates: sortByDateDesc(state.templates),
    resellers: {
      tree: reseller.tree,
      flat: reseller.flat,
      orphanClients: reseller.orphanClients,
      knownClients: reseller.knownClients,
    },
    analytics: {
      settlement: {
        pendingBets: dashboard.betting.pendingBets,
        pendingStake: dashboard.betting.pendingStake,
        pendingPotentialPayout: dashboard.betting.pendingPotentialPayout,
        pendingOverdue: dashboard.betting.pendingOverdue,
        platformNetSettled: dashboard.betting.platformNetSettled,
        recentBets: dashboard.betting.recentBets,
      },
      bettingTrend: dashboard.betting.trend,
      economy: dashboard.economy,
      liveMarkets: liveMarkets.map(mapLiveMarket),
    },
  };
}
