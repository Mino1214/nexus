import type { PandoraTabId } from './pandoraNav';

/**
 * 제품 층: masterAdmin → 총마켓(totalMarket) / Pandora(FutureChart)
 * - `hts`: 차트·HTS 운영(본편)
 * - `hub`: FutureChart 네이티브 운영 콘솔(승인·회원·알림 등 — React, API 단계적 연동)
 */
export type PandoraProductLayer = 'hts' | 'hub';

export function tabProductLayer(tab: PandoraTabId): PandoraProductLayer {
  if (tab === 'sectionChart' || tab === 'sectionHtsOps') return 'hts';
  return 'hub';
}
