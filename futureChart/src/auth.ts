import type { AdminSession } from './admin/types';

/** 앱 전역 세션 (차트 + 운영 콘솔 공통) */
const KEY = 'fc-app-auth';

export function readAuth(): AdminSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as AdminSession;
    if (!j?.role || !j?.id) return null;
    return j;
  } catch {
    return null;
  }
}

export function saveAuth(s: AdminSession | null) {
  if (!s) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(s));
}

/** 예전 키에서 한 번만 이전 */
export function migrateLegacySession(): void {
  if (localStorage.getItem(KEY)) return;
  const legacy = localStorage.getItem('fc-admin-session');
  if (!legacy) return;
  try {
    const j = JSON.parse(legacy) as AdminSession;
    if (j?.role && j?.id) {
      saveAuth(j);
      localStorage.removeItem('fc-admin-session');
    }
  } catch {
    /* ignore */
  }
}

/** 초기 로드 시 레거시 키를 이전한 뒤 세션 반환 */
export function readAuthWithMigration(): AdminSession | null {
  migrateLegacySession();
  return readAuth();
}
