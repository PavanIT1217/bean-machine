/**
 * Pre-rendered shaded spheres. Drawing a cached bitmap per ball is far cheaper than
 * building a radial gradient per ball per frame, and gives the metallic look.
 */
export function makeSphereSprite(
  radiusPx: number,
  light: string,
  mid: string,
  dark: string,
): HTMLCanvasElement {
  const size = Math.max(2, Math.ceil(radiusPx * 2) + 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const r = size / 2 - 1;
  const cx = size / 2;
  const g = ctx.createRadialGradient(cx - r * 0.38, cx - r * 0.42, r * 0.05, cx, cx, r);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fill();
  return c;
}
