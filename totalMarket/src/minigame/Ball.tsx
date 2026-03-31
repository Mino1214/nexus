import type { BallState } from './useGameEngine';

const COLOR_MAP: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
};

export type Projected = { x: number; y: number; scale: number; depth: number };

export function drawBall(
  ctx: CanvasRenderingContext2D,
  b: BallState,
  offsetX: number,
  offsetY: number,
  p?: Projected,
) {
  const fill = COLOR_MAP[b.color] || '#94a3b8';
  const z = typeof b.z === 'number' ? b.z : 0.5; // 0..1
  const proj = p || { x: offsetX + b.x, y: offsetY + b.y, scale: 0.78 + z * 0.42, depth: z };
  const x = proj.x;
  const y = proj.y;
  const scale = proj.scale;
  const rr = b.r * scale;

  // shadow
  ctx.beginPath();
  ctx.ellipse(x + 3, y + rr * 0.95 + 8, rr * 1.12, rr * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(2,6,23,${0.10 + proj.depth * 0.22})`;
  ctx.fill();

  // ball
  const hx = x - rr * (0.55 - proj.depth * 0.18);
  const hy = y - rr * (0.55 - proj.depth * 0.18);
  const g = ctx.createRadialGradient(hx, hy, rr * 0.2, x, y, rr);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, fill);
  g.addColorStop(0.75, shade(fill, 0.28));
  g.addColorStop(1, '#081021');
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = `rgba(255,255,255,${0.25 + proj.depth * 0.26})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // specular ring (adds "unity-like" pop)
  ctx.beginPath();
  ctx.arc(x - rr * 0.12, y - rr * 0.18, rr * 0.55, -Math.PI * 0.15, Math.PI * 0.65);
  ctx.strokeStyle = `rgba(255,255,255,${0.10 + proj.depth * 0.16})`;
  ctx.lineWidth = Math.max(1, rr * 0.08);
  ctx.stroke();
}

function shade(hex: string, amount: number) {
  // amount: 0..1, darken
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (n: number) => Math.max(0, Math.min(255, Math.floor(n * (1 - amount))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

