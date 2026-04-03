import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import './OrderBookPanel.css';

export type BookLevel = { price: number; qty: number };

const EMPTY_ROWS: (BookLevel | null)[] = [null];

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

function pricesClose(a: number | null, b: number | null, epsilon = 1e-9) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= epsilon;
}

function nearestAskPrice(levels: readonly BookLevel[], px: number | null): number | null {
  if (px == null || levels.length === 0) return null;
  const above = levels.filter((level) => level.price >= px);
  if (above.length > 0) return Math.min(...above.map((level) => level.price));
  let best = /** @type {number | null} */ (null);
  for (const level of levels) {
    if (best == null || Math.abs(level.price - px) < Math.abs(best - px)) {
      best = level.price;
    }
  }
  return best;
}

function nearestBidPrice(levels: readonly BookLevel[], px: number | null): number | null {
  if (px == null || levels.length === 0) return null;
  const below = levels.filter((level) => level.price <= px);
  if (below.length > 0) return Math.max(...below.map((level) => level.price));
  let best = /** @type {number | null} */ (null);
  for (const level of levels) {
    if (best == null || Math.abs(level.price - px) < Math.abs(best - px)) {
      best = level.price;
    }
  }
  return best;
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
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  const [buyQtyStr, setBuyQtyStr] = useState('');
  const [sellQtyStr, setSellQtyStr] = useState('');
  const [virtualQty, setVirtualQty] = useState(0);
  const [virtualAvgPx, setVirtualAvgPx] = useState<number | null>(null);

  useEffect(() => {
    setVirtualQty(0);
    setVirtualAvgPx(null);
    setBuyQtyStr('');
    setSellQtyStr('');
  }, [symbol]);

  const maxQty = useMemo(() => {
    const qs = [
      ...asks.map((a) => a.qty),
      ...bids.map((b) => b.qty),
    ];
    return Math.max(1, ...qs, 1);
  }, [asks, bids]);

  const { midPrice, spread, bestAsk, bestBid } = useMemo(() => {
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
    return { midPrice: mid, spread: spr, bestAsk: ba, bestBid: bb };
  }, [asks, bids, lastTradePrice]);

  const displayPx = lastTradePrice ?? midPrice;

  const execPrice = useMemo(() => {
    if (lastTradePrice != null && Number.isFinite(lastTradePrice)) return lastTradePrice;
    return midPrice;
  }, [lastTradePrice, midPrice]);

  const askRows = useMemo(() => orderAskLevels(asks), [asks]);
  const bidRows = useMemo(() => orderBidLevels(bids), [bids]);
  const displayDepth = Math.max(asks.length, bids.length, 0);
  const currentAskPrice = useMemo(() => nearestAskPrice(asks, displayPx), [asks, displayPx]);
  const currentBidPrice = useMemo(() => nearestBidPrice(bids, displayPx), [bids, displayPx]);

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

  const virtualBuy = () => {
    const q = Number(buyQtyStr.replace(/\D/g, ''));
    if (!Number.isFinite(q) || q <= 0 || execPrice == null) return;
    const next = virtualQty + q;
    const avg =
      virtualAvgPx == null
        ? execPrice
        : (virtualAvgPx * virtualQty + execPrice * q) / next;
    setVirtualQty(next);
    setVirtualAvgPx(avg);
    setBuyQtyStr('');
  };

  const virtualSell = () => {
    const q = Number(sellQtyStr.replace(/\D/g, ''));
    if (!Number.isFinite(q) || q <= 0 || execPrice == null) return;
    if (q > virtualQty) return;
    const next = virtualQty - q;
    setVirtualQty(next);
    if (next <= 0) setVirtualAvgPx(null);
    setSellQtyStr('');
  };

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

      <div className="obColHead" aria-hidden>
        <span className="obColHeadCell">매수</span>
        <span className="obColHeadCell obColHeadCell--center">현재가</span>
        <span className="obColHeadCell">매도</span>
      </div>

      <div className="obHeroPx" aria-label="현재가">
        {displayPx != null ? formatObPrice(displayPx, priceDecimals) : '—'}
        {spread != null && spread >= 0 ? (
          <span className="obHeroSpread"> 스프레드 {formatObPrice(spread, priceDecimals)}</span>
        ) : null}
      </div>

      <ul className="obStackList obStackList--ask" aria-label={`매도 ${displayDepth || 0}단`}>
        {askRows.map((level, i) => {
          const pct = level ? Math.min(100, (100 * level.qty) / maxQty) : 0;
          const isCurrentBand = level ? pricesClose(level.price, currentAskPrice) : false;
          return (
            <li
              key={`ask-${i}-${level?.price ?? 'e'}`}
              className={`obStackRow obStackRow--ask${isCurrentBand ? ' obStackRow--currentAsk' : ''}`}
              style={{ '--qty-pct': `${pct}%` } as CSSProperties}
            >
              <div className="obStackCell obStackCell--bidZone" />
              <div className="obStackCell obStackCell--price">
                {level ? formatObPrice(level.price, priceDecimals) : '—'}
              </div>
              <div className="obStackCell obStackCell--askZone">
                {level ? (
                  <div className="obStackBarTrack obStackBarTrack--ask">
                    <div className="obStackBarFill obStackBarFill--ask" style={{ width: `${pct}%` }} />
                    <span className="obStackVol">{level.qty.toLocaleString('ko-KR')}</span>
                  </div>
                ) : (
                  <div className="obStackBarTrack obStackBarTrack--empty" />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="obGoldDivider" aria-hidden>
        <span className="obGoldLine" />
        <span className="obGoldMid">
          {midPrice != null ? (
            <>
              현재가격 {formatObPrice(displayPx ?? midPrice, priceDecimals)}
              {bestAsk != null && bestBid != null ? (
                <span className="obGoldHint">
                  {' '}
                  (매도1 {formatObPrice(bestAsk, priceDecimals)} / 매수1 {formatObPrice(bestBid, priceDecimals)})
                </span>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </span>
        <span className="obGoldLine" />
      </div>

      <ul className="obStackList obStackList--bid" aria-label={`매수 ${displayDepth || 0}단`}>
        {bidRows.map((level, i) => {
          const pct = level ? Math.min(100, (100 * level.qty) / maxQty) : 0;
          const isCurrentBand = level ? pricesClose(level.price, currentBidPrice) : false;
          return (
            <li
              key={`bid-${i}-${level?.price ?? 'e'}`}
              className={`obStackRow obStackRow--bid${isCurrentBand ? ' obStackRow--currentBid' : ''}`}
              style={{ '--qty-pct': `${pct}%` } as CSSProperties}
            >
              <div className="obStackCell obStackCell--bidZone">
                {level ? (
                  <div className="obStackBarTrack obStackBarTrack--bid">
                    <div className="obStackBarFill obStackBarFill--bid" style={{ width: `${pct}%` }} />
                    <span className="obStackVol">{level.qty.toLocaleString('ko-KR')}</span>
                  </div>
                ) : (
                  <div className="obStackBarTrack obStackBarTrack--empty" />
                )}
              </div>
              <div className="obStackCell obStackCell--price">
                {level ? formatObPrice(level.price, priceDecimals) : '—'}
              </div>
              <div className="obStackCell obStackCell--askZone" />
            </li>
          );
        })}
      </ul>

      <div className="obVirtual" aria-label="가상 매매">
        <div className="obVirtualRow">
          <div className="obVirtualBlock">
            <span className="obVirtualLabel">매수</span>
            <input
              className="obVirtualInput"
              type="text"
              inputMode="numeric"
              placeholder="수량"
              value={buyQtyStr}
              onChange={(e) => setBuyQtyStr(e.target.value)}
            />
            <button type="button" className="obVirtualBtn obVirtualBtn--buy" onClick={virtualBuy} disabled={execPrice == null}>
              가상 매수
            </button>
          </div>
          <div className="obVirtualBlock">
            <span className="obVirtualLabel">매도</span>
            <input
              className="obVirtualInput"
              type="text"
              inputMode="numeric"
              placeholder="수량"
              value={sellQtyStr}
              onChange={(e) => setSellQtyStr(e.target.value)}
            />
            <button
              type="button"
              className="obVirtualBtn obVirtualBtn--sell"
              onClick={virtualSell}
              disabled={execPrice == null || virtualQty <= 0}
            >
              가상 매도
            </button>
          </div>
        </div>
        <p className="obVirtualPos">
          가상 보유{' '}
          <strong>{virtualQty.toLocaleString('ko-KR')}</strong>주
          {virtualAvgPx != null && virtualQty > 0 ? (
            <>
              {' '}
              · 평단 <strong>{formatObPrice(virtualAvgPx, priceDecimals)}</strong>
              {priceDecimals === 0 ? '원' : ''}
            </>
          ) : null}
          {execPrice != null ? (
            <span className="obVirtualExec">
              {' '}
              · 체결기준 {formatObPrice(execPrice, priceDecimals)}
              {priceDecimals === 0 ? '원' : ''}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
