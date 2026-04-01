import { useCallback, useEffect, useState } from 'react';

export type AppRoute = 'chart' | 'admin';

function parseHash(): AppRoute {
  const h = window.location.hash.replace(/^#/, '');
  if (h === '/admin' || h.startsWith('/admin')) return 'admin';
  return 'chart';
}

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(() => parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goChart = useCallback(() => {
    window.location.hash = '#/';
  }, []);

  const goAdmin = useCallback(() => {
    window.location.hash = '#/admin';
  }, []);

  return { route, goChart, goAdmin };
}
