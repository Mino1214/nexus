import { useEffect, useMemo, useRef, useState } from 'react';

export type Phase = 'idle' | 'trigger' | 'release' | 'spawnSpecial';

const STORAGE_KEY = 'totalMarket_minigame3d_phase_v3';

type Snap = { startAt: number; seed0: number; lastSeenAt: number };

function loadSnap(): Snap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Snap;
    if (!j?.startAt) return null;
    if (typeof (j as any).seed0 !== 'number') return null;
    if (typeof (j as any).lastSeenAt !== 'number') return null;
    return j;
  } catch {
    return null;
  }
}

function saveSnap(s: Snap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function useGameController() {
  const [snap, setSnap] = useState<Snap>(() => {
    const now = Date.now();
    return loadSnap() || { startAt: now, seed0: (Math.random() * 1e9) | 0, lastSeenAt: now };
  });
  const [now, setNow] = useState(() => Date.now());
  const raf = useRef<number | null>(null);
  const lastPersistRef = useRef(0);

  useEffect(() => {
    // 새로고침/재진입 시 "바닥 열림 타이밍"에 걸려서 흰공이 우수수 떨어지는 체감을 방지:
    // 마지막 접속이 끊겼다(>2s)고 판단되면 사이클을 idle로 리셋
    const now0 = Date.now();
    if (now0 - snap.lastSeenAt > 2000) {
      setSnap((p) => ({ ...p, startAt: now0, lastSeenAt: now0 }));
      return;
    }
    saveSnap(snap);
    function loop() {
      const n = Date.now();
      setNow(n);
      // throttle storage writes (about 1/sec)
      if (n - lastPersistRef.current > 900) {
        lastPersistRef.current = n;
        saveSnap({ ...snap, lastSeenAt: n });
      }
      raf.current = requestAnimationFrame(loop);
    }
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      try {
        saveSnap({ ...snap, lastSeenAt: Date.now() });
      } catch {
        /* ignore */
      }
    };
  }, [snap, setSnap]);

  const t = Math.max(0, now - snap.startAt);

  const timeline = useMemo(() => {
    // demo timing (repeat)
    // idle 0~5s, trigger 5~5.4s, release 5.4~6.3s, spawnSpecial 6.3~10s, then loop
    const loopMs = 11000;
    const cycle = Math.floor(t / loopMs);
    const tt = t % loopMs;
    let phase: Phase = 'idle';
    if (tt >= 5000 && tt < 5400) phase = 'trigger';
    else if (tt >= 5400 && tt < 6300) phase = 'release';
    else if (tt >= 6300 && tt < 10000) phase = 'spawnSpecial';
    else phase = 'idle';

    const triggerStrength = tt < 5000 ? 0 : Math.min(1, (tt - 5000) / 400);
    const releaseOpen = tt < 5400 ? 0 : Math.min(1, (tt - 5400) / 900);
    const specialOn = phase === 'spawnSpecial';

    const cycleSeed = ((snap.seed0 + cycle * 1103515245) ^ (cycle * 12345)) >>> 0;
    return { tt, cycle, cycleSeed, phase, triggerStrength, releaseOpen, specialOn };
  }, [t, snap.seed0]);

  return { ...timeline, startAt: snap.startAt, now };
}

