import { useEffect, useMemo, useRef } from 'react';
import { drawBall, type Projected } from './Ball';
import type { BallState } from './useGameEngine';

const SEGMENTS = [
  { key: 'red', label: 'RED', color: '#ef4444' },
  { key: 'blue', label: 'BLUE', color: '#3b82f6' },
  { key: 'green', label: 'GREEN', color: '#22c55e' },
  { key: 'yellow', label: 'YELLOW', color: '#eab308' },
  { key: 'purple', label: 'PURPLE', color: '#a855f7' },
] as const;

export function BallDropCanvas({
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = useMemo(() => ({ w: 420, h: 520 }), []);

  useEffect(() => {
    void tick; // just to re-render per frame
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = size.w;
    const H = size.h;

    ctx.clearRect(0, 0, W, H);

    // background card
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, W, H, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,76,129,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // title
    ctx.font = '800 14px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText('3D 공 떨어뜨리기 (gravity + bounce)', 16, 28);

    // next spawn info
    const now = Date.now();
    const spawnEveryMs = 30 * 1000; // 테스트용
    const nextAt = spawnTime + spawnEveryMs;
    const remain = Math.max(0, nextAt - now);
    const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
    const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(15,23,42,0.65)';
    ctx.fillText(`다음 생성까지: ${mm}:${ss} (5분마다 3개)`, 16, 48);

    // --- falling area ---
    const areaX = 16;
    const areaY = 70;
    const areaW = W - 32;
    const areaH = 330;

    ctx.fillStyle = '#f3f6fb';
    roundRect(ctx, areaX, areaY, areaW, areaH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,76,129,0.14)';
    ctx.stroke();

    // --- faux 3D world projection (unity-like) ---
    // world coords: x,y in px-ish, z in 0..1 depth (0=far, 1=near)
    const proj = (x: number, y: number, z: number): Projected => {
      const zz = Math.max(0, Math.min(1, z));
      const persp = 0.78 + zz * 0.62; // perspective scale
      // slight upward shift for far depth to feel like a tilted camera
      const tiltY = (1 - zz) * 26;
      return {
        x: areaX + (x - 200) * persp + 200,
        y: areaY + y * persp + tiltY,
        scale: persp,
        depth: zz,
      };
    };

    // y-구멍(레일 + 홀) world positions (match engine constants)
    const topY = 160;
    const bottomY = 430;
    const funnelTopY = (bottomY - topY) - 110;
    const holeY = (bottomY - topY) - 18;
    const holeR = 18;
    const leftHoleX = 120;
    const rightHoleX = 280;
    const centerX = 200;

    // floor plane (trapezoid) + rim
    drawFloorPlane(ctx, proj, 20, funnelTopY - 10, 380, (bottomY - topY) - 8);

    // rails (Y shape) as beveled 3D beams
    drawBeam(ctx, proj, centerX, funnelTopY, leftHoleX, holeY - 10);
    drawBeam(ctx, proj, centerX, funnelTopY, rightHoleX, holeY - 10);

    // holes as cylinders
    drawHole3D(ctx, proj, leftHoleX, holeY, holeR);
    drawHole3D(ctx, proj, rightHoleX, holeY, holeR);

    // balls (sort by z so far ones draw first)
    const sorted = [...balls].sort((a, b) => (a.z ?? 0.5) - (b.z ?? 0.5));
    for (const b of sorted) {
      const p = proj(b.x, b.y, b.z ?? 0.62);
      drawBall(ctx, b, 0, 0, p);
    }

    // --- bottom: result slot ---
    const slotX = 16;
    const slotY = 420;
    const slotW = W - 32;
    const slotH = 82;

    ctx.fillStyle = '#ffffff';
    roundRect(ctx, slotX, slotY, slotW, slotH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,76,129,0.14)';
    ctx.stroke();

    ctx.font = '800 13px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = '#0f4c81';
    ctx.fillText('결과 (마지막으로 바닥에 안착한 공)', slotX + 14, slotY + 24);

    const res = lastResult || '—';
    ctx.font = '900 22px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(String(res).toUpperCase(), slotX + 14, slotY + 56);

    const chip = SEGMENTS.find((s) => s.key === lastResult);
    if (chip) {
      ctx.fillStyle = chip.color;
      roundRect(ctx, slotX + slotW - 116, slotY + 24, 96, 34, 999);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '900 13px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(chip.label, slotX + slotW - 68, slotY + 46);
    }
  }, [tick, balls, lastResult, spawnTime, size.w, size.h]);

  return (
    <div className="page-card" style={{ padding: 16 }}>
      <canvas ref={canvasRef} width={size.w} height={size.h} style={{ width: '100%', maxWidth: 540, display: 'block' }} />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawFloorPlane(
  ctx: CanvasRenderingContext2D,
  proj: (x: number, y: number, z: number) => Projected,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const p1 = proj(x1, y1, 0.15);
  const p2 = proj(x2, y1, 0.15);
  const p3 = proj(x2, y2, 0.9);
  const p4 = proj(x1, y2, 0.9);

  // plane fill
  const g = ctx.createLinearGradient(p1.x, p1.y, p4.x, p4.y);
  g.addColorStop(0, '#eef3fb');
  g.addColorStop(1, '#dfeaf8');
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  // rim stroke
  ctx.strokeStyle = 'rgba(15,76,129,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // floor line near camera
  ctx.strokeStyle = 'rgba(15,76,129,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p4.x + 10, p4.y - 6);
  ctx.lineTo(p3.x - 10, p3.y - 6);
  ctx.stroke();
}

function drawBeam(
  ctx: CanvasRenderingContext2D,
  proj: (x: number, y: number, z: number) => Projected,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const a = proj(x1, y1, 0.35);
  const b = proj(x2, y2, 0.85);
  // shadow
  ctx.strokeStyle = 'rgba(2,6,23,0.14)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x + 2, a.y + 3);
  ctx.lineTo(b.x + 2, b.y + 3);
  ctx.stroke();
  // beam
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.35, 'rgba(15,76,129,0.55)');
  g.addColorStop(1, 'rgba(2,6,23,0.22)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawHole3D(
  ctx: CanvasRenderingContext2D,
  proj: (x: number, y: number, z: number) => Projected,
  x: number,
  y: number,
  r: number,
) {
  const pTop = proj(x, y, 0.88);
  const rr = r * pTop.scale;

  // rim (bevel)
  const rim = ctx.createRadialGradient(pTop.x - rr * 0.2, pTop.y - rr * 0.2, rr * 0.3, pTop.x, pTop.y, rr * 1.25);
  rim.addColorStop(0, 'rgba(255,255,255,0.55)');
  rim.addColorStop(0.45, 'rgba(15,76,129,0.22)');
  rim.addColorStop(1, 'rgba(2,6,23,0.18)');
  ctx.beginPath();
  ctx.arc(pTop.x, pTop.y, rr * 1.12, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();

  // inner hole depth
  const hole = ctx.createRadialGradient(pTop.x - rr * 0.15, pTop.y - rr * 0.15, rr * 0.2, pTop.x, pTop.y, rr);
  hole.addColorStop(0, '#0b1220');
  hole.addColorStop(1, '#000000');
  ctx.beginPath();
  ctx.arc(pTop.x, pTop.y, rr, 0, Math.PI * 2);
  ctx.fillStyle = hole;
  ctx.fill();
}

