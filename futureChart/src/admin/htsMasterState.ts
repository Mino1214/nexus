import type { DistributorHtsConfig, ManagedHtsUser } from './types';

const KEY = 'fc-hts-master-state-v1';

export type HtsMasterPersisted = {
  managedUsers: ManagedHtsUser[];
  distributorConfigs: DistributorHtsConfig[];
};

export function loadHtsMasterPersisted(): Partial<HtsMasterPersisted> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as HtsMasterPersisted;
    if (!j || typeof j !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

export function saveHtsMasterPersisted(state: HtsMasterPersisted) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** 저장본이 있으면 기본 총판 목록에 덮어씀 */
export function mergeDistributorConfigs(
  defaults: DistributorHtsConfig[],
  saved: DistributorHtsConfig[] | undefined,
): DistributorHtsConfig[] {
  if (!saved?.length) return defaults.map((d) => ({ ...d, bettingTrend: d.bettingTrend.map((b) => ({ ...b })) }));
  const sm = new Map(saved.map((c) => [c.distributorId, c]));
  return defaults.map((d) => {
    const o = sm.get(d.distributorId);
    if (!o) return { ...d, bettingTrend: d.bettingTrend.map((b) => ({ ...b })) };
    return {
      ...d,
      ...o,
      bettingTrend: o.bettingTrend?.length ? o.bettingTrend.map((b) => ({ ...b })) : d.bettingTrend.map((b) => ({ ...b })),
    };
  });
}
