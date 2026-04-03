import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import './OrderBookPanel.css';

export type BookLevel = { price: number; qty: number };

const EMPTY_ROWS: (BookLevel | null)[] = Array(10).fill(null);

type Props = {
  asks: BookLevel[];
  bids: BookLevel[];
  symbol: string | null;
  variant?: 'default' | 'hts';
  lastTradePrice?: number | null;
  obRevision?: number;
  tickRevision?: number;
  /** 호가·현재가 소수 자릿수 (선물/FX는 2~5 권장, 국내 주식 0) */
  priceDecimals?: number;
  /** 마지막 호가 수신 후 일정 시간 초과 시 true → 시각적으로 stale 표시 */
  isStale?: boolean;
  /** Yahoo Finance 현재가 기반 참고 호가 (실시간 아님) */
  isSynthetic?: boolean;
  /** 표시할 최대 호가 단 수 (초과분은 잘라냄) */
  maxDepth?: number;
  onPriceSelect?: (price: number) => void;
};

function formatObPrice(n: number, decimals: number) {
  const d = Number.isFinite(decimals) ? Math.min(8, Math.max(0, Math.floor(decimals))) : 2;
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** 매도: 위에서 아래로 고가→저가 (호가1이 시세에 가깝게 아래쪽) */
function orderAskLevels(asks: BookLevel[]): (BookLevel | null)[] {
  return asks.length > 0 ? [...asks].reverse() : EMPTY_ROWS;
}

/** 매수: 위에서 아래로 우선호가→낮은가 */
function orderBidLevels(bids: BookLevel[]): (BookLevel | null)[] {
  return bids.length > 0 ? [...bids] : EMPTY_ROWS;
}


export function OrderBookPanel({
  asks,
  bids,
  symbol,
  variant = 'default',
  lastTradePrice = null,
  obRevision = 0,
  tickRevision = 0,
  priceDecimals = 2,
  isStale = false,
  isSynthetic = false,
  maxDepth,
  onPriceSelect,
}: Props) {
  const slicedAsks = maxDepth != null ? asks.slice(0, maxDepth) : asks;
  const slicedBids = maxDepth != null ? bids.slice(0, maxDepth) : bids;
  asks = slicedAsks;
  bids = slicedBids;
  const rootRef = useRef<HTMLDivElement>(null);

  const maxQty = useMemo(() => {
    const qs = [
      ...asks.map((a) => a.qty),
      ...bids.map((b) => b.qty),
    ];
    return Math.max(1, ...qs, 1);
  }, [asks, bids]);

  const { midPrice, spread } = useMemo(() => {
    const ba = asks.length ? Math.min(...asks.map((a) => a.price)) : null;
    const bb = bids.length ? Math.max(...bids.map((b) => b.price)) : null;
    let mid: number | null = null;
    let spr: number | null = null;
    if (ba != null && bb != null) {
      mid = (ba + bb) / 2;
      spr = ba - bb;
    } else if (ba != null) mid = ba;
    else if (bb != null) mid = bb;
    else if (lastTradePrice != null && Number.isFinite(lastTradePrice)) mid = lastTradePrice;
    return { midPrice: mid, spread: spr };
  }, [asks, bids, lastTradePrice]);

  const displayPx = lastTradePrice ?? midPrice;

  const askRows = useMemo(() => orderAskLevels(asks), [asks]);
  const bidRows = useMemo(() => orderBidLevels(bids), [bids]);
  const displayDepth = Math.max(asks.length, bids.length, 0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (obRevision <= 0 && tickRevision <= 0) return;
    el.classList.add('obPanel--tick');
    const t = window.setTimeout(() => el.classList.remove('obPanel--tick'), 140);
    return () => {
      window.clearTimeout(t);
      el.classList.remove('obPanel--tick');
    };
  }, [obRevision, tickRevision]);

  const hasBook = asks.length > 0 || bids.length > 0;

  return (
    <div
      ref={rootRef}
      className={`obPanel${variant === 'hts' ? ' obPanel--hts' : ''}${hasBook ? ' obPanel--live' : ''}${isStale ? ' obPanel--stale' : ''}`}
      aria-label="실시간 호가"
    >
      <div className="obHead">
        <span className="obTitle">호가</span>
        {symbol ? <span className="obSym">{symbol}</span> : <span className="obSym muted">대기</span>}
        <span className="obDepthTag">{displayDepth > 0 ? `${displayDepth}단` : '대기'}</span>
        {isSynthetic ? (
          <span className="obSyntheticTag" title="Yahoo Finance 현재가 기준 참고 호가 (실시간 아님)">참고 호가</span>
        ) : isStale ? (
          <span className="obStaleTag">업데이트 대기</span>
        ) : null}
      </div>

      {/* 컬럼 헤더 */}
      <div className="obColHead" aria-hidden>
        <span className="obColHeadCell obColHeadCell--price">가격</span>
        <span className="obColHeadCell obColHeadCell--qty">수량</span>
      </div>

      {/* ── 매도 목록 (위 = 높은가, 아래 = 낮은가 → 현재가에 가까운 쪽이 아래) ── */}
      <ul className="obStackList obStackList--ask" aria-label={`매도 ${displayDepth || 0}단`}>
        {askRows.map((level, i) => {
          const pct = level ? Math.min(100, (100 * level.qty) / maxQty) : 0;
          return (
            <li
              key={`ask-${i}-${level?.price ?? 'e'}`}
              className={`obStackRow obStackRow--ask${level && onPriceSelect ? ' obStackRow--interactive' : ''}`}
              style={{ '--qty-pct': `${pct}%` } as CSSProperties}
              role={level && onPriceSelect ? 'button' : undefined}
              tabIndex={level && onPriceSelect ? 0 : undefined}
              onClick={level && onPriceSelect ? () => onPriceSelect(level.price) : undefined}
              onKeyDown={
                level && onPriceSelect
                  ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPriceSelect(level.price); } }
                  : undefined
              }
            >
              <span className="obPx obPx--ask">{level ? formatObPrice(level.price, priceDecimals) : '—'}</span>
              <span className="obQty">{level ? level.qty.toLocaleString('ko-KR') : ''}</span>
            </li>
          );
        })}
      </ul>

      {/* ── 현재가 구분선 ── */}
      <div className="obGoldDivider" aria-label="현재가">
        <span className="obGoldMidPx">
          {displayPx != null ? formatObPrice(displayPx, priceDecimals) : '—'}
        </span>
        {spread != null && spread >= 0 ? (
          <span className="obGoldSpread">스프레드 {formatObPrice(spread, priceDecimals)}</span>
        ) : null}
      </div>

      {/* ── 매수 목록 (위 = 높은가 = 현재가에 가까운 쪽) ── */}
      <ul className="obStackList obStackList--bid" aria-label={`매수 ${displayDepth || 0}단`}>
        {bidRows.map((level, i) => {
          const pct = level ? Math.min(100, (100 * level.qty) / maxQty) : 0;
          return (
            <li
              key={`bid-${i}-${level?.price ?? 'e'}`}
              className={`obStackRow obStackRow--bid${level && onPriceSelect ? ' obStackRow--interactive' : ''}`}
              style={{ '--qty-pct': `${pct}%` } as CSSProperties}
              role={level && onPriceSelect ? 'button' : undefined}
              tabIndex={level && onPriceSelect ? 0 : undefined}
              onClick={level && onPriceSelect ? () => onPriceSelect(level.price) : undefined}
              onKeyDown={
                level && onPriceSelect
                  ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPriceSelect(level.price); } }
                  : undefined
              }
            >
              <span className="obPx obPx--bid">{level ? formatObPrice(level.price, priceDecimals) : '—'}</span>
              <span className="obQty">{level ? level.qty.toLocaleString('ko-KR') : ''}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
