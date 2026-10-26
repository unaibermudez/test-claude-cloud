import { describe, it, expect } from 'vitest';
import { ICON_ART, MATERIALS } from '../src/render/iconart';
import { ALL_ITEMS } from '../src/data/items';

describe('arte de los iconos', () => {
  it('cada mapa cabe en 14×14 (deja sitio al contorno) y solo usa materiales conocidos', () => {
    for (const [name, art] of Object.entries(ICON_ART)) {
      expect(art.length, name).toBeGreaterThan(0);
      expect(art.length, name).toBeLessThanOrEqual(14);
      for (const row of art) {
        expect(row.length, `${name}: «${row}»`).toBeLessThanOrEqual(14);
        for (const ch of row) expect(ch === '.' || MATERIALS.includes(ch), `${name}: carácter ${ch}`).toBe(true);
      }
      expect(art.some((r) => /[^.]/.test(r)), `${name} vacío`).toBe(true);
    }
  });

  it('todos los objetos tienen un icono dibujado', () => {
    const missing = ALL_ITEMS.filter((d) => !ICON_ART[d.icon]).map((d) => `${d.id}:${d.icon}`);
    expect(missing).toEqual([]);
  });
});
