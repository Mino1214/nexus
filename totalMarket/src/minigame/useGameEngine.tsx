import { useEffect, useMemo, useRef, useState } from 'react';

type ColorKey = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export type BallState = {
  id: string;
  color: ColorKey;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number; // 0..1 depth (visual only)
  vz: number; // depth velocity (visual only)
  r: number;
  createdAt: number; // epoch ms
  landed: boolean;
};

export type EngineSnapshot = {
  engineStartAt: number;
  lastSpawnAt: number;
  spawnEveryMs: number;
  balls: BallState[];
  lastResult: ColorKey | null;
};

const STORAGE_KEY = 'totalMarket_minigame_engine_v1';

const COLORS: ColorKey[] = ['red', 'blue', 'green', 'yellow', 'purple'];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSnapshot(): EngineSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as EngineSnapshot;
    if (!j || typeof j !== 'object') return null;
    if (!j.engineStartAt || !j.lastSpawnAt || !j.spawnEveryMs) return null;
    if (!Array.isArray(j.balls)) return null;
    return j;
  } catch {
    return null;
  }
}

function saveSnapshot(s: EngineSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function newEngine(now: number): EngineSnapshot {
  // 테스트용: 30초마다 3개 생성 (원복 시 5 * 60 * 1000)
  const spawnEveryMs = 30 * 1000;
  return {
    engineStartAt: now,
    lastSpawnAt: now,
    spawnEveryMs,
    balls: [],
    lastResult: null,
  };
}

export function useGameEngine() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => loadSnapshot() || newEngine(Date.now()));
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const saveCooldownRef = useRef<number>(0);

  // keep a derived "tick" so consumers can re-render each frame even if they don't care about balls diff
  const tick = useMemo(() => Date.now() - snapshot.engineStartAt, [snapshot.engineStartAt, snapshot.lastSpawnAt, snapshot.balls.length, snapshot.lastResult]);

  function spawnBalls(baseTime: number, count: number): BallState[] {
    const rng = mulberry32(Math.floor(baseTime / 1000));
    const out: BallState[] = [];
    for (let i = 0; i < count; i++) {
      const c = COLORS[Math.floor(rng() * COLORS.length)];
      // 공 3개 모두 동일 크기/무게(질량은 단순화해서 동일 취급)
      const r = 14;
      const z = 0.62;
      out.push({
        id: `${baseTime}-${i}-${Math.floor(rng() * 1e9)}`,
        color: c,
        // 공기포/발사 느낌: 아래쪽에서 위로 쏘아올리듯 시작
        x: 90 + rng() * 220,
        y: 240 + rng() * 40,
        vx: (rng() - 0.5) * 140,
        vy: -780 - rng() * 160,
        z,
        vz: 0,
        r,
        createdAt: baseTime,
        landed: false,
      });
    }
    return out;
  }

  function collideWithSegment(b: BallState, x1: number, y1: number, x2: number, y2: number, bounce: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 1e-6) return;
    const t = clamp(((b.x - x1) * dx + (b.y - y1) * dy) / len2, 0, 1);
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const vx = b.x - px;
    const vy = b.y - py;
    const dist2 = vx * vx + vy * vy;
    const r = b.r;
    if (dist2 >= r * r) return;

    const dist = Math.sqrt(Math.max(1e-6, dist2));
    const nx = vx / dist;
    const ny = vy / dist;
    const pen = r - dist;
    b.x += nx * pen;
    b.y += ny * pen;

    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      // 반사 + 탄성
      b.vx -= (1 + bounce) * vn * nx;
      b.vy -= (1 + bounce) * vn * ny;
    }
  }

  function stepPhysics(prev: EngineSnapshot, now: number): EngineSnapshot {
    // fixed timestep for snappy physics (less "어눌")
    const dtMsRaw = now - lastTickRef.current;
    lastTickRef.current = now;
    const dtMs = clamp(dtMsRaw, 0, 80);
    const fixed = 1 / 120; // 120hz physics
    const steps = clamp(Math.round((dtMs / 1000) / fixed), 1, 10);

    // world constants (canvas coords, middle playfield)
    const W = 400;
    const topY = 160; // start of fall area
    const bottomY = 430; // ground in fall area
    const leftX = 20;
    const rightX = W - 20;
    const gravity = 1850; // px/s^2 (체감 확실히)
    const bounce = 0.92; // 더 탱탱하게
    const floorFriction = 0.996;
    const airDragX = 0.999;
    const airDragY = 0.9995;
    const depthDrag = 1;

    // spawn schedule: every 5 minutes, 3 balls
    let lastSpawnAt = prev.lastSpawnAt;
    const spawnEveryMs = prev.spawnEveryMs;
    const balls: BallState[] = prev.balls.filter((b) => now - b.createdAt < 30 * 60 * 1000); // prune 30min old

    while (now - lastSpawnAt >= spawnEveryMs) {
      lastSpawnAt += spawnEveryMs;
      balls.push(...spawnBalls(lastSpawnAt, 6));
    }

    let lastResult = prev.lastResult;

    // Y자 빠지는 구멍 (좌/우 홀 + 가이드 레일 2개)
    const funnelTopY = (bottomY - topY) - 110;
    const holeY = (bottomY - topY) - 18;
    const holeR = 18;
    const leftHoleX = 120;
    const rightHoleX = 280;
    const centerX = 200;

    for (let s = 0; s < steps; s++) {
      const dt = fixed;
      for (const b of balls) {
        if (b.landed) continue;

        // integrate
        b.vy += gravity * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z = clamp(b.z + b.vz * dt, 0, 1);
        b.vz *= depthDrag;
        b.vx *= airDragX;
        b.vy *= airDragY;

        // walls
        if (b.x - b.r < leftX) {
          b.x = leftX + b.r;
          b.vx = Math.abs(b.vx) * bounce;
        } else if (b.x + b.r > rightX) {
          b.x = rightX - b.r;
          b.vx = -Math.abs(b.vx) * bounce;
        }

        // Y rails
        if (b.y > funnelTopY - 50 && b.y < holeY + 30) {
          collideWithSegment(b, centerX, funnelTopY, leftHoleX, holeY - 10, bounce);
          collideWithSegment(b, centerX, funnelTopY, rightHoleX, holeY - 10, bounce);
        }

        // holes: enter => result
        if (b.y + b.r >= holeY - holeR) {
          const dxL = b.x - leftHoleX;
          const dyL = b.y - holeY;
          const dxR = b.x - rightHoleX;
          const dyR = b.y - holeY;
          const inLeft = dxL * dxL + dyL * dyL <= (holeR - 2) * (holeR - 2);
          const inRight = dxR * dxR + dyR * dyR <= (holeR - 2) * (holeR - 2);
          if (inLeft || inRight) {
            b.landed = true;
            lastResult = b.color;
            continue;
          }
        }

        // floor bounce
        if (topY + b.y + b.r >= bottomY) {
          const hitV = b.vy;
          b.y = (bottomY - topY) - b.r;
          b.vy = -Math.abs(hitV) * bounce;
          b.vx *= floorFriction;
          b.vz *= 0.7;
          if (Math.abs(b.vy) < 55) {
            // keep some energy so it "keeps shaking"
            b.vy = -240;
          }
        }
      }
    }

    return { ...prev, balls, lastSpawnAt, lastResult };
  }

  useEffect(() => {
    lastTickRef.current = Date.now();
    function loop() {
      const now = Date.now();
      setSnapshot((prev) => stepPhysics(prev, now));

      // throttle persistence
      saveCooldownRef.current += 1;
      if (saveCooldownRef.current >= 12) {
        saveCooldownRef.current = 0;
        const latest = loadSnapshot();
        // avoid clobber if multiple tabs: only overwrite if ours is newer by lastSpawnAt/balls count
        // keep it simple: just save current
        void latest;
        setSnapshot((cur) => {
          saveSnapshot(cur);
          return cur;
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      saveSnapshot(snapshot);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // manual sync (e.g. when tab refocus)
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        lastTickRef.current = now;
        setSnapshot((prev) => stepPhysics(prev, now));
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return {
    tick,
    balls: snapshot.balls,
    lastResult: snapshot.lastResult,
    spawnTime: snapshot.lastSpawnAt,
    engineStartAt: snapshot.engineStartAt,
  };
}

