import type { AdminRole } from '../admin/types';

/**
 * macroServer admin.html `data-tab` / 섹션 ID와 동일한 키.
 * 제외: sectionWallet, sectionSeeds, sectionGiftSeed (지갑·시드·시드지급)
 * HTS 모듈 전용: sectionChart
 */
export type PandoraTabId =
  | 'sectionChart'
  | 'sectionHtsOps'
  | 'sectionApproval'
  | 'sectionUsers'
  | 'sectionMyTgBot'
  | 'sectionMySettlement'
  | 'sectionWithdraw'
  | 'sectionPricing'
  | 'sectionTelegram'
  | 'sectionSettleMgmt'
  | 'sectionPopups'
  | 'sectionDownloads';

/**
 * 사이드바 그룹 — 제품 층만 구분 (기존 common/manager/master 는 tier 로 유지)
 * - hts: FutureChart 본편(차트·HTS 운영)
 * - hub: FutureChart 네이티브 운영 콘솔(승인·회원·알림봇·정산 등)
 */
export type NavSection = 'hts' | 'hub';

export type NavItemDef = {
  id: PandoraTabId;
  label: string;
  icon: string;
  section: NavSection;
  /** admin.html 의 master-tab / manager-tab 과 유사 */
  tier: 'all' | 'manager' | 'master';
};

export const PANDORA_NAV: NavItemDef[] = [
  { id: 'sectionChart', label: '거래·차트', icon: '📈', section: 'hts', tier: 'master' },
  { id: 'sectionHtsOps', label: 'HTS 운영', icon: '⚙️', section: 'hts', tier: 'master' },
  { id: 'sectionApproval', label: '승인', icon: '✅', section: 'hub', tier: 'master' },
  { id: 'sectionUsers', label: '회원', icon: '🗂️', section: 'hub', tier: 'all' },
  { id: 'sectionMyTgBot', label: '알림봇', icon: '📣', section: 'hub', tier: 'all' },
  { id: 'sectionMySettlement', label: '정산내역', icon: '💵', section: 'hub', tier: 'manager' },
  { id: 'sectionWithdraw', label: '출금신청', icon: '💸', section: 'hub', tier: 'manager' },
  { id: 'sectionPricing', label: '가격', icon: '💰', section: 'hub', tier: 'master' },
  { id: 'sectionTelegram', label: '텔레그램', icon: '✉️', section: 'hub', tier: 'master' },
  { id: 'sectionSettleMgmt', label: '정산관리', icon: '📋', section: 'hub', tier: 'master' },
  { id: 'sectionPopups', label: '공지팝업', icon: '📢', section: 'hub', tier: 'master' },
  { id: 'sectionDownloads', label: '다운로드', icon: '⬇️', section: 'hub', tier: 'master' },
];

function roleTier(role: AdminRole): 'master' | 'manager' | 'user' {
  if (role === 'master') return 'master';
  if (role === 'distributor') return 'manager';
  return 'user';
}

/** admin.html 과 동일한 메뉴 노출 규칙(데모 세션 기준) */
export function isNavItemVisible(item: NavItemDef, role: AdminRole): boolean {
  const t = roleTier(role);
  if (item.tier === 'all') return true;
  if (item.tier === 'master') return t === 'master';
  if (item.tier === 'manager') return t === 'master' || t === 'manager';
  return false;
}

export function defaultTabForRole(): PandoraTabId {
  return 'sectionChart';
}

export function sectionLabel(s: NavSection): string {
  if (s === 'hts') return 'FutureChart · HTS';
  return 'FutureChart · 운영 콘솔';
}
