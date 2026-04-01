import type { AdminSession } from './types';
import { DEMO_ACCOUNTS } from './mockData';

const RUNTIME_KEY = 'fc-hts-runtime-accounts-v1';

function loadRuntime(): Record<string, { password: string; session: AdminSession }> {
  try {
    const raw = localStorage.getItem(RUNTIME_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, { password: string; session: AdminSession }>;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

export function resolveLogin(loginId: string, password: string): AdminSession | null {
  const id = loginId.trim();
  const base = DEMO_ACCOUNTS[id];
  if (base && base.password === password) {
    return { ...base.session };
  }
  const rt = loadRuntime()[id];
  if (rt && rt.password === password) {
    return { ...rt.session };
  }
  return null;
}

/** 유저 관리에서 생성한 계정 — 비밀번호 기본 demo */
export function registerRuntimeDemoUser(id: string, password: string, session: AdminSession) {
  const k = id.trim();
  if (!k) return;
  const next = { ...loadRuntime(), [k]: { password, session } };
  localStorage.setItem(RUNTIME_KEY, JSON.stringify(next));
}
