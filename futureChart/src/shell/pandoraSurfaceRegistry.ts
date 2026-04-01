import type { PandoraTabId } from './pandoraNav';

export type PandoraProductLayer = 'hts' | 'hub';

export function tabProductLayer(tab: PandoraTabId): PandoraProductLayer {
  if (tab === 'sectionHtsOps') return 'hts';
  return 'hub';
}
