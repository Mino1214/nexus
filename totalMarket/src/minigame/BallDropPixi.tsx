import { useEffect, useMemo, useRef } from 'react';
import * as PIXI from 'pixi.js';
import type { BallState } from './useGameEngine';

const COLOR_MAP: Record<string, number> = {
  red: 0xef4444,
  blue: 0x3b82f6,
  green: 0x22c55e,
  yellow: 0xeab308,
  purple: 0xa855f7,
};

type Projected = { x: number; y: number; scale: number; depth: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function projFactory(areaX: number, areaY: number) {
  return (x: number, y: number, z: number): Projected => {
    const zz = clamp(z, 0, 1);
    const persp = 0.78 + zz * 0.62;
    const tiltY = (1 - zz) * 26;
    return {
      x: areaX + (x - 200) * persp + 200,
      y: areaY + y * persp + tiltY,
      scale: persp,
      depth: zz,
    };
  };
}

function makeBallNode(color: number, r: number) {
  // WebGL에서도 "완전 3D 머터리얼"에 가깝게 보이도록:
  // base + deep shadow + specular(add) + rim
  const node = new PIXI.Container();

  const shadow = new PIXI.Graphics();
  shadow.circle(3, 5, r * 1.02).fill({ color: 0x020617, alpha: 0.32 });
  node.addChild(shadow);

  const base = new PIXI.Graphics();
  base.circle(0, 0, r).fill({ color, alpha: 1 });
  base.circle(-r * 0.25, -r * 0.28, r * 0.85).fill({ color: 0xffffff, alpha: 0.12 });
  base.circle(r * 0.22, r * 0.18, r * 0.95).fill({ color: 0x081021, alpha: 0.18 });
  base.circle(0, 0, r).stroke({ color: 0xffffff, alpha: 0.18, width: Math.max(1, Math.floor(r * 0.08)) });
  node.addChild(base);

  const spec = new PIXI.Graphics();
  spec.circle(-r * 0.42, -r * 0.48, r * 0.42).fill({ color: 0xffffff, alpha: 0.55 });
  spec.circle(-r * 0.10, -r * 0.15, r * 0.20).fill({ color: 0xffffff, alpha: 0.45 });
  spec.blendMode = 'add';
  node.addChild(spec);

  const rim = new PIXI.Graphics();
  rim.circle(0, 0, r * 0.98).stroke({ color: 0xffffff, alpha: 0.22, width: Math.max(1, Math.floor(r * 0.10)) });
  node.addChild(rim);

  return node;
}

export function BallDropPixi({
  tick,
  balls,
  lastResult,
  spawnTime,
}: {
  tick: number;
  balls: BallState[];
  lastResult: string | null;
  spawnTime: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const ballLayerRef = useRef<PIXI.Container | null>(null);
  const spritesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const size = useMemo(() => ({ w: 540, h: 520 }), []);

  useEffect(() => {
    let destroyed = false;
    let inited = false;
    const host = hostRef.current;
    if (!host) return;

    const app = new PIXI.Application();
    appRef.current = app;

    (async () => {
      try {
        await app.init({
          width: size.w,
          height: size.h,
          antialias: true,
          backgroundAlpha: 0,
          resolution: Math.min(2, window.devicePixelRatio || 1),
          autoDensity: true,
          powerPreference: 'high-performance',
        });
        inited = true;
      } catch (_e) {
        // init failed; nothing to render
        return;
      }
      if (destroyed) {
        // StrictMode/dev: cleanup might run before init completes
        try {
          app.destroy();
        } catch {
          /* ignore */
        }
        return;
      }

      host.innerHTML = '';
      host.appendChild(app.canvas);

      const root = new PIXI.Container();
      app.stage.addChild(root);

      // card background
      const card = new PIXI.Graphics();
      card.roundRect(0, 0, size.w, size.h, 16).fill({ color: 0xffffff, alpha: 1 });
      card.roundRect(0, 0, size.w, size.h, 16).stroke({ color: 0x0f4c81, alpha: 0.18, width: 1 });
      root.addChild(card);

      // title
      const title = new PIXI.Text({
        text: 'WebGL 미니게임 (Ball Drop)',
        style: new PIXI.TextStyle({
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          fontSize: 14,
          fontWeight: '800',
          fill: 0x0f172a,
        }),
      });
      title.x = 16;
      title.y = 10;
      root.addChild(title);

      const sub = new PIXI.Text({
        text: '',
        style: new PIXI.TextStyle({
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          fontSize: 12,
          fontWeight: '600',
          fill: 0x0f172a,
        }),
      });
      sub.alpha = 0.6;
      sub.x = 16;
      sub.y = 34;
      root.addChild(sub);

      // area
      const areaX = 16;
      const areaY = 64;
      const areaW = size.w - 32;
      const areaH = 336;

      const area = new PIXI.Graphics();
      area.roundRect(areaX, areaY, areaW, areaH, 14).fill({ color: 0xf3f6fb, alpha: 1 });
      area.roundRect(areaX, areaY, areaW, areaH, 14).stroke({ color: 0x0f4c81, alpha: 0.14, width: 1 });
      root.addChild(area);

      // faux 3D floor + rails + holes
      const world = new PIXI.Graphics();
      root.addChild(world);

      // balls
      const ballLayer = new PIXI.Container();
      ballLayerRef.current = ballLayer;
      root.addChild(ballLayer);

      // result
      const slot = new PIXI.Graphics();
      slot.roundRect(16, 412, size.w - 32, 92, 14).fill({ color: 0xffffff, alpha: 1 });
      slot.roundRect(16, 412, size.w - 32, 92, 14).stroke({ color: 0x0f4c81, alpha: 0.14, width: 1 });
      root.addChild(slot);

      const slotLabel = new PIXI.Text({
        text: '결과 (마지막으로 홀에 들어간 공)',
        style: new PIXI.TextStyle({
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          fontSize: 13,
          fontWeight: '800',
          fill: 0x0f4c81,
        }),
      });
      slotLabel.x = 30;
      slotLabel.y = 424;
      root.addChild(slotLabel);

      const slotValue = new PIXI.Text({
        text: '—',
        style: new PIXI.TextStyle({
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          fontSize: 24,
          fontWeight: '900',
          fill: 0x0f172a,
        }),
      });
      slotValue.x = 30;
      slotValue.y = 448;
      root.addChild(slotValue);

      const chip = new PIXI.Graphics();
      root.addChild(chip);

      const P = projFactory(areaX, areaY);
      // constants must match engine
      const topY = 160;
      const bottomY = 430;
      const funnelTopY = bottomY - topY - 110;
      const holeY = bottomY - topY - 18;
      const holeR = 18;
      const leftHoleX = 120;
      const rightHoleX = 280;
      const centerX = 200;

      function drawWorld() {
        world.clear();

        // floor trapezoid
        const p1 = P(20, funnelTopY - 10, 0.15);
        const p2 = P(380, funnelTopY - 10, 0.15);
        const p3 = P(380, bottomY - topY - 8, 0.9);
        const p4 = P(20, bottomY - topY - 8, 0.9);
        world.moveTo(p1.x, p1.y)
          .lineTo(p2.x, p2.y)
          .lineTo(p3.x, p3.y)
          .lineTo(p4.x, p4.y)
          .closePath()
          .fill({ color: 0xdfeaf8, alpha: 1 });
        world.stroke({ color: 0x0f4c81, alpha: 0.22, width: 2 });

        // near floor line
        world.moveTo(p4.x + 10, p4.y - 6).lineTo(p3.x - 10, p3.y - 6);
        world.stroke({ color: 0x0f4c81, alpha: 0.35, width: 3, cap: 'round' });

        // rails (shadow then beam)
        const a = P(centerX, funnelTopY, 0.35);
        const bl = P(leftHoleX, holeY - 10, 0.85);
        const br = P(rightHoleX, holeY - 10, 0.85);
        world.moveTo(a.x + 2, a.y + 3).lineTo(bl.x + 2, bl.y + 3);
        world.moveTo(a.x + 2, a.y + 3).lineTo(br.x + 2, br.y + 3);
        world.stroke({ color: 0x020617, alpha: 0.14, width: 10, cap: 'round' });

        world.moveTo(a.x, a.y).lineTo(bl.x, bl.y);
        world.moveTo(a.x, a.y).lineTo(br.x, br.y);
        world.stroke({ color: 0x0f4c81, alpha: 0.55, width: 7, cap: 'round' });

        // holes
        drawHole(leftHoleX, holeY, holeR);
        drawHole(rightHoleX, holeY, holeR);
      }

      function drawHole(x: number, y: number, r: number) {
        const p = P(x, y, 0.88);
        const rr = r * p.scale;
        // rim
        world.circle(p.x, p.y, rr * 1.12).fill({ color: 0x0f4c81, alpha: 0.16 });
        world.circle(p.x, p.y, rr * 1.12).stroke({ color: 0xffffff, alpha: 0.25, width: 2 });
        // inner
        world.circle(p.x, p.y, rr).fill({ color: 0x000000, alpha: 1 });
      }

      drawWorld();

      app.ticker.add(() => {
        // next spawn display
        const now = Date.now();
        const spawnEveryMs = 30 * 1000;
        const nextAt = spawnTime + spawnEveryMs;
        const remain = Math.max(0, nextAt - now);
        const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
        const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
        sub.text = `다음 생성까지: ${mm}:${ss} (30초마다 6개)`;

        // result
        const res = lastResult ? String(lastResult).toUpperCase() : '—';
        slotValue.text = res;
        chip.clear();
        if (lastResult && COLOR_MAP[lastResult]) {
          chip.roundRect(size.w - 120, 442, 96, 34, 999).fill({ color: COLOR_MAP[lastResult], alpha: 1 });
          const t = new PIXI.Text({
            text: res,
            style: new PIXI.TextStyle({
              fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
              fontSize: 13,
              fontWeight: '900',
              fill: 0xffffff,
            }),
          });
          t.anchor.set(0.5);
          t.x = size.w - 72;
          t.y = 459;
          chip.addChild(t);
          // remove immediately next frame; we recreate to keep code simple
          app.ticker.addOnce(() => {
            chip.removeChildren();
          });
        }

        // sync ball sprites
        const map = spritesRef.current;

        // remove old
        for (const [id, node] of map.entries()) {
          if (!balls.find((b) => b.id === id && !b.landed)) {
            node.destroy({ children: true });
            map.delete(id);
          }
        }

        // add/update
        const active = balls.filter((b) => !b.landed);
        active.sort((a, b) => (a.z ?? 0.62) - (b.z ?? 0.62));
        for (const b of active) {
          let node = map.get(b.id);
          if (!node) {
            node = new PIXI.Container();
            node.addChild(makeBallNode(COLOR_MAP[b.color] || 0x94a3b8, 18));
            ballLayer.addChild(node);
            map.set(b.id, node);
          }

          const p = P(b.x, b.y, b.z ?? 0.62);
          node.x = p.x;
          node.y = p.y;
          node.scale.set(p.scale * 0.95);
          node.alpha = 0.94 + p.depth * 0.06;
        }
      });
    })();

    return () => {
      destroyed = true;
      // React StrictMode may call cleanup twice; only destroy if this instance is still current
      if (appRef.current === app) appRef.current = null;
      // avoid pixi internal resize-cancel crash by only destroying after init, and guarding errors
      if (inited) {
        try {
          // stop ticker first
          try {
            app.ticker.stop();
          } catch {
            /* ignore */
          }
          app.destroy();
        } catch {
          /* ignore */
        }
      }
      spritesRef.current.clear();
    };
  }, [size.h, size.w]);

  // trigger rerender updates (ticker reads props via closure, so we rebuild minimal by forcing effect on tick deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {}, [tick, balls, lastResult, spawnTime]);

  return (
    <div className="page-card" style={{ padding: 16 }}>
      <div ref={hostRef} />
    </div>
  );
}

