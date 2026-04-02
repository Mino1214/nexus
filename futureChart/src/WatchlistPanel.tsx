import { FUTURES_WATCHLIST, impliedChangeAbs, type WatchInstrument } from './watchlistData';
import './WatchlistPanel.css';

export type { WatchInstrument };

export type WatchLiveQuote = {
  lastPrice: number;
  volume: number;
  changePct: number;
};

type Props = {
  selectedId: string;
  onSelect: (item: WatchInstrument) => void;
  items?: WatchInstrument[];
  /** 브로커 틱으로 갱신된 행 (없으면 시드값 표시) */
  liveById?: Record<string, WatchLiveQuote | undefined>;
};

function thumbLetters(code: string): string {
  const c = code.replace(/\s/g, '');
  if (c.length >= 2) return c.slice(0, 2).toUpperCase();
  return c.toUpperCase() || '?';
}

function formatPrice(n: number, decimals: number): string {
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatChangeAbs(d: number, decimals: number): string {
  const sign = d > 0 ? '+' : '';
  const dcl = Math.min(Math.max(decimals, 2), 5);
  return (
    sign +
    d.toLocaleString('ko-KR', {
      minimumFractionDigits: dcl,
      maximumFractionDigits: dcl,
    })
  );
}

export function WatchlistPanel({ selectedId, onSelect, items = FUTURES_WATCHLIST, liveById }: Props) {
  return (
    <div className="wlPanel" aria-label="마켓워치">
      <div className="wlHead">마켓워치</div>
      <div className="wlTableWrap">
        <table className="wlTable">
          <thead>
            <tr>
              <th className="wlTh wlTh--sym" scope="col">
                심볼
              </th>
              <th className="wlTh wlTh--num" scope="col">
                현재가
              </th>
              <th className="wlTh wlTh--num" scope="col">
                전일대비
              </th>
              <th className="wlTh wlTh--num" scope="col">
                등락률
              </th>
              <th className="wlTh wlTh--vol" scope="col">
                거래량
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const live = liveById?.[it.id];
              const lastPrice = live?.lastPrice ?? it.lastPrice;
              const changePct = live?.changePct ?? it.changePct;
              const volume = live?.volume ?? it.volume;
              const chAbs = impliedChangeAbs(lastPrice, changePct);
              const up = changePct > 0;
              const down = changePct < 0;
              const dirCls = up ? 'wlNum--up' : down ? 'wlNum--down' : 'wlNum--flat';
              const active = selectedId === it.id;
              const hue = it.hue ?? 200;

              return (
                <tr
                  key={it.id}
                  className={`wlTr${active ? ' wlTr--active' : ''}`}
                  onClick={() => onSelect(it)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(it);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <td className="wlTd wlTd--sym">
                    <div className="wlSymInner">
                      <div
                        className="wlThumb"
                        style={{
                          background: `linear-gradient(135deg, hsl(${hue}, 42%, 38%) 0%, hsl(${hue}, 35%, 22%) 100%)`,
                        }}
                        aria-hidden
                      >
                        {thumbLetters(it.code)}
                      </div>
                      <div className="wlSymText">
                        <div className="wlCodeLine">
                          <span className="wlCode">{it.code}</span>
                          {it.indexTag ? <sup className="wlIdx">지</sup> : null}
                        </div>
                        <div className="wlName" title={it.name}>
                          {it.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`wlTd wlTd--num wlMono ${dirCls}`}>{formatPrice(lastPrice, it.priceDecimals)}</td>
                  <td className={`wlTd wlTd--num wlMono ${dirCls}`}>
                    {up ? '↑ ' : down ? '↓ ' : ''}
                    {formatChangeAbs(chAbs, it.priceDecimals)}
                  </td>
                  <td className={`wlTd wlTd--num wlMono ${dirCls}`}>
                    {up ? '↑ ' : down ? '↓ ' : ''}
                    {changePct > 0 ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </td>
                  <td className="wlTd wlTd--vol wlMono">{volume.toLocaleString('ko-KR')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
