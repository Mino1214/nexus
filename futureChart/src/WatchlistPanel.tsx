import { FUTURES_WATCHLIST, impliedChangeAbs, type WatchInstrument } from './watchlistData';
import './WatchlistPanel.css';

export type { WatchInstrument };

type Props = {
  selectedId: string;
  onSelect: (item: WatchInstrument) => void;
  items?: WatchInstrument[];
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

export function WatchlistPanel({ selectedId, onSelect, items = FUTURES_WATCHLIST }: Props) {
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
              const chAbs = impliedChangeAbs(it.lastPrice, it.changePct);
              const up = it.changePct > 0;
              const down = it.changePct < 0;
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
                  <td className={`wlTd wlTd--num wlMono ${dirCls}`}>{formatPrice(it.lastPrice, it.priceDecimals)}</td>
                  <td className={`wlTd wlTd--num wlMono ${dirCls}`}>
                    {up ? '↑ ' : down ? '↓ ' : ''}
                    {formatChangeAbs(chAbs, it.priceDecimals)}
                  </td>
                  <td className={`wlTd wlTd--num wlMono ${dirCls}`}>
                    {up ? '↑ ' : down ? '↓ ' : ''}
                    {it.changePct > 0 ? '+' : ''}
                    {it.changePct.toFixed(2)}%
                  </td>
                  <td className="wlTd wlTd--vol wlMono">{it.volume.toLocaleString('ko-KR')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
