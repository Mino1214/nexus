import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import './OrderBookPanel.css';

export type BookLevel = { price: number; qty: number };

const DEPTH = 10;

type Props = {
  asks: BookLevel[];
  bids: BookLevel[];
  symbol: string | null;
  variant?: 'default' | 'hts';
  lastTradePrice?: number | null;
  obRevision?: number;
  tickRevision?: number;
};

function fmtPx(n: number) {
  return Math.round(n).toLocaleString('ko-KR');
}

/** 매도: 위에서 아래로 고가→저가 (호가1이 시세에 가깝게 아래쪽) */
function padAskLevels(asks: BookLevel[]): (BookLevel | null)[] {
  const rev = [...asks].reverse();
  const out: (BookLevel | null)[] = [];
  for (let i = 0; i < DEPTH; i++) out.push(rev[i] ?? null);
  return out;
}

/** 매수: 위에서 아래로 우선호가→낮은가 */
function padBidLevels(bids: BookLevel[]): (BookLevel | null)[] {
  const out: (BookLevel | null)[] = [];
  for (let i = 0; i < DEPTH; i++) out.push(bids[i] ?? null);
  return out;
}

export function OrderBookPanel({
  asks,
  bids,
  symbol,
  variant = 'default',
  lastTradePrice = null,
  obRevision = 0,
  tickRevision = 0,
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

  const askRows = useMemo(() => padAskLevels(asks), [asks]);
  const bidRows = useMemo(() => padBidLevels(bids), [bids]);

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
      className={`obPanel${variant === 'hts' ? ' obPanel--hts' : ''}${hasBook ? ' obPanel--live' : ''}`}
      aria-label="실시간 호가"
    >
      <div className="obHead">
        <span className="obTitle">호가</span>
        {symbol ? <span className="obSym">{symbol}</span> : <span className="obSym muted">대기</span>}
        <span className="obDepthTag">{DEPTH}단</span>
      </div>

      <div className="obColHead" aria-hidden>
        <span className="obColHeadCell">매수</span>
        <span className="obColHeadCell obColHeadCell--center">현재가</span>
        <span className="obColHeadCell">매도</span>
      </div>

      <div className="obHeroPx" aria-label="현재가">
        {displayPx != null ? fmtPx(displayPx) : '—'}
        {spread != null && spread >= 0 ? (
          <span className="obHeroSpread"> 스프레드 {fmtPx(spread)}</span>
        ) : null}
      </div>

      <ul className="obStackList obStackList--ask" aria-label={`매도 ${DEPTH}단`}>
        {askRows.map((level, i) => {
          const pct = level ? Math.min(100, (100 * level.qty) / maxQty) : 0;
          return (
            <li
              key={`ask-${i}-${level?.price ?? 'e'}`}
              className="obStackRow obStackRow--ask"
              style={{ '--qty-pct': `${pct}%` } as CSSProperties}
            >
              <div className="obStackCell obStackCell--bidZone" />
              <div className="obStackCell obStackCell--price">
                {level ? level.price.toLocaleString('ko-KR') : '—'}
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
              평균 {fmtPx(midPrice)}
              {bestAsk != null && bestBid != null ? (
                <span className="obGoldHint">
                  {' '}
                  (매도1 {fmtPx(bestAsk)} / 매수1 {fmtPx(bestBid)})
                </span>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </span>
        <span className="obGoldLine" />
      </div>

      <ul className="obStackList obStackList--bid" aria-label={`매수 ${DEPTH}단`}>
        {bidRows.map((level, i) => {
          const pct = level ? Math.min(100, (100 * level.qty) / maxQty) : 0;
          return (
            <li
              key={`bid-${i}-${level?.price ?? 'e'}`}
              className="obStackRow obStackRow--bid"
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
                {level ? level.price.toLocaleString('ko-KR') : '—'}
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
              · 평단 <strong>{fmtPx(virtualAvgPx)}</strong>원
            </>
          ) : null}
          {execPrice != null ? (
            <span className="obVirtualExec"> · 체결기준 {fmtPx(execPrice)}원</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
