import { getMasterAdminApiBase, isMasterAdminSyncEnabled } from '../config/featureFlags';
import type { DistributorHtsConfig, ManagedHtsUser } from './types';

/**
 * HTS 마스터 테넌트 ↔ masterAdmin 연동용 클라이언트.
 * 백엔드 경로는 추후 확정 시 이 파일만 맞추면 됩니다.
 */
export type PushResult = { ok: true } | { ok: false; message: string };

async function tryFetch(path: string, init: RequestInit): Promise<PushResult> {
  const base = getMasterAdminApiBase();
  if (!base) {
    return { ok: false, message: 'VITE_FC_MASTERADMIN_API_BASE 가 비어 있습니다.' };
  }
  try {
    const res = await fetch(`${base}${path}`, init);
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, message: t || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function pushDistributorSettings(config: DistributorHtsConfig): Promise<PushResult> {
  if (!isMasterAdminSyncEnabled()) return { ok: true };
  return tryFetch(`/api/hts/distributors/${encodeURIComponent(config.distributorId)}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function pushManagedUser(user: ManagedHtsUser): Promise<PushResult> {
  if (!isMasterAdminSyncEnabled()) return { ok: true };
  return tryFetch(`/api/hts/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
}

export async function pushCreateUser(user: ManagedHtsUser & { initialPassword?: string }): Promise<PushResult> {
  if (!isMasterAdminSyncEnabled()) return { ok: true };
  return tryFetch('/api/hts/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
}
