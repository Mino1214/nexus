import { useEffect, useMemo, useState } from 'react';
import { assetUrl, fetchPublic } from '../api';

type Popup = {
  id: number;
  title: string;
  body_html: string | null;
  image_url: string | null;
  link_url: string | null;
  link_text: string | null;
};

export function PortalPopup() {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [kstToday, setKstToday] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const hideKey = useMemo(() => {
    if (!popup || !kstToday) return null;
    return `totalMarket_hide_popup_${popup.id}_${kstToday}`;
  }, [popup, kstToday]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const j = await fetchPublic<{ popup: Popup | null; kstToday: string }>('/portal/popup');
        if (c) return;
        setPopup(j.popup);
        setKstToday(j.kstToday);
      } catch {
        if (!c) {
          setPopup(null);
          setKstToday(null);
        }
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (!popup || !hideKey) return;
    try {
      const hidden = localStorage.getItem(hideKey) === '1';
      if (!hidden) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [popup, hideKey]);

  if (!popup || !open) return null;

  function hideToday() {
    if (!hideKey) return;
    try {
      localStorage.setItem(hideKey, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="닫기">
          ×
        </button>
        <h2 style={{ marginBottom: 10 }}>{popup.title}</h2>
        {popup.image_url ? (
          <div className="modal-hero">
            <img src={assetUrl(popup.image_url)} alt="" />
          </div>
        ) : null}
        {popup.body_html ? (
          <div className="portal-body-html" dangerouslySetInnerHTML={{ __html: popup.body_html }} />
        ) : null}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost" onClick={hideToday}>
            하루동안 보지않기
          </button>
          <button type="button" className="btn outline" onClick={() => setOpen(false)}>
            닫기
          </button>
          {popup.link_url ? (
            <a className="btn" href={popup.link_url} target="_blank" rel="noreferrer">
              {popup.link_text || '자세히'}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
