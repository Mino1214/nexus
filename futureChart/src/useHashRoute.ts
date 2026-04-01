import { useCallback, useEffect, useState } from 'react';

/** 메인 셸 vs 콘솔 딥링크 (구 #/admin → #/fx/console) */
export type AppRoute = 'main' | 'console';

function parseHash(): AppRoute {
  const raw = window.location.hash.replace(/^#/, '').split('?')[0];
  let h = raw.endsWith('/') && raw.length > 1 ? raw.slice(0, -1) : raw;
  if (h === '' || h === '/') h = '/fx';
  if (h === '/fx/console' || h.startsWith('/fx/console/')) return 'console';
  if (h === '/admin' || h.startsWith('/admin')) return 'console';
  return 'main';
}

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(() => parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goMain = useCallback(() => {
    window.location.hash = '#/fx';
  }, []);

  const goConsole = useCallback(() => {
    window.location.hash = '#/fx/console';
  }, []);

  return { route, goMain, goConsole, goChart: goMain, goAdmin: goConsole };
}
