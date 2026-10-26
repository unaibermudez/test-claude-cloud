import { describe, it, expect } from 'vitest';
import { generateFloor, validateFloor } from '../src/core/mapgen';
import { TILE } from '../src/core/state';
import type { ZoneId } from '../src/core/content';

const N = Number(process.env.MAPGEN_SEEDS ?? 300);

describe('generador de pisos', () => {
  it('es determinista', () => {
    const a = generateFloor({ zone: 2, floor: 2, seed: 'det' });
    const b = generateFloor({ zone: 2, floor: 2, seed: 'det' });
    expect(a.tiles).toEqual(b.tiles);
    expect(a.props).toEqual(b.props);
  });

  for (const zone of [1, 2, 3, 4, 5, 6] as ZoneId[]) {
    it(`zona ${zone}: ${N} semillas por piso son completables y rápidas`, () => {
      let worst = 0;
      for (let floor = 1; floor <= 4; floor++) {
        for (let s = 0; s < N; s++) {
          const t0 = performance.now();
          const m = generateFloor({ zone, floor, seed: `t${s}` });
          worst = Math.max(worst, performance.now() - t0);
          const v = validateFloor(m);
          expect(v.ok, `${zone}-${floor} semilla t${s}: ${v.reason}`).toBe(true);
          expect(m.props.some((p) => p.kind === 'exit')).toBe(true);
          expect(m.tiles[m.entry.y * m.w + m.entry.x]).not.toBe(TILE.WALL);
        }
      }
      expect(worst).toBeLessThan(100);
    });
  }

  it('el piso tutorial tiene llave y salida', () => {
    const m = generateFloor({ zone: 1, floor: 1, seed: 'tut', tutorial: true });
    expect(m.props.filter((p) => p.kind === 'keycard').length).toBeGreaterThan(0);
  });
});
