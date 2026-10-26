/**
 * Campo de visión por sombras recursivas (shadowcasting en 8 octantes).
 * `opaque(x,y)` indica si la casilla bloquea la vista; `visit(x,y)` se llama
 * para cada casilla visible (incluida la de origen).
 */
const MULT = [
  [1, 0, 0, -1, -1, 0, 0, 1],
  [0, 1, -1, 0, 0, -1, 1, 0],
  [0, 1, 1, 0, 0, -1, -1, 0],
  [1, 0, 0, 1, -1, 0, 0, -1],
];

export function computeFov(
  ox: number,
  oy: number,
  radius: number,
  opaque: (x: number, y: number) => boolean,
  visit: (x: number, y: number) => void,
): void {
  visit(ox, oy);
  const r2 = radius * radius + radius;
  for (let oct = 0; oct < 8; oct++) {
    castLight(ox, oy, 1, 1.0, 0.0, radius, r2, MULT[0][oct], MULT[1][oct], MULT[2][oct], MULT[3][oct], opaque, visit);
  }
}

function castLight(
  cx: number, cy: number, row: number, start: number, end: number, radius: number, r2: number,
  xx: number, xy: number, yx: number, yy: number,
  opaque: (x: number, y: number) => boolean, visit: (x: number, y: number) => void,
): void {
  if (start < end) return;
  let newStart = 0;
  for (let j = row; j <= radius; j++) {
    let dx = -j - 1;
    const dy = -j;
    let blocked = false;
    while (dx <= 0) {
      dx += 1;
      const X = cx + dx * xx + dy * xy;
      const Y = cy + dx * yx + dy * yy;
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);
      if (start < rSlope) continue;
      if (end > lSlope) break;
      if (dx * dx + dy * dy < r2) visit(X, Y);
      const op = opaque(X, Y);
      if (blocked) {
        if (op) {
          newStart = rSlope;
          continue;
        }
        blocked = false;
        start = newStart;
      } else if (op && j < radius) {
        blocked = true;
        castLight(cx, cy, j + 1, start, lSlope, radius, r2, xx, xy, yx, yy, opaque, visit);
        newStart = rSlope;
      }
    }
    if (blocked) break;
  }
}

/** Línea de visión simple entre dos puntos usando Bresenham simétrico. */
export function hasLos(
  x0: number, y0: number, x1: number, y1: number, opaque: (x: number, y: number) => boolean,
): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 256; guard++) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && opaque(x, y)) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return false;
}
