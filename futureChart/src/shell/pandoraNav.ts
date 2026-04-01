import type { AdminRole } from '../admin/types';

/**
 * macroServer admin.html `data-tab` / 섹션과 맞춤 (지갑·시드·시드지급 제외).
 * HTS 본편: sectionHtsOps 만 유지 (거래·차트 단독 탭 제거).
 */
export type PandoraTabId =
  | 'sectionHtsOps'
  | 'sectionMemberDesk'
  | 'sectionMyTgBot'
  | 'sectionMySettlement'
  | 'sectionWithdraw'
  | 'sectionPricing'
  | 'sectionTelegram'
  | 'sectionSettleMgmt'
  | 'sectionPopups'
  | 'sectionDownloads';

export type NavSection = 'hts' | 'hub';

export type NavItemDef = {
  id: PandoraTabId;
  label: string;
  icon: string;
  section: NavSection;
  tier: 'all' | 'manager' | 'master';
};

export const PANDORA_NAV: NavItemDef[] = [
  { id: 'sectionHtsOps', label: 'HTS 운영', icon: '⚙️', section: 'hts', tier: 'master' },
  { id: 'sectionMemberDesk', label: '회원·승인', icon: '🗂️', section: 'hub', tier: 'all' },
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

export function isNavItemVisible(item: NavItemDef, role: AdminRole): boolean {
  const t = roleTier(role);
  if (item.tier === 'all') return true;
  if (item.tier === 'master') return t === 'master';
  if (item.tier === 'manager') return t === 'master' || t === 'manager';
  return false;
}

export function defaultTabForRole(role: AdminRole): PandoraTabId {
  if (role === 'master') return 'sectionHtsOps';
  return 'sectionMemberDesk';
}

export function sectionLabel(s: NavSection): string {
  if (s === 'hts') return 'FX · HTS';
  return 'FX · 운영';
}
