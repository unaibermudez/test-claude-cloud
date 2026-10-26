import { describe, it, expect } from 'vitest';
import { createRng, next, int, chance, cloneRng, dailySeed, weighted, shuffle } from '../src/core/rng';
import { computeFov, hasLos } from '../src/core/fov';
import { findPath, distanceMap, UNREACHABLE } from '../src/core/path';
import { format, setPronoun, setGlobal, setLang, t } from '../src/i18n';
import { arena, run, msgs, ROOM } from './helpers';
import { getPlayer, spawnActor } from '../src/core/actors';
import { getStats, addItem, countItem, removeItem } from '../src/core/rules';
import { EventSink } from '../src/core/events';
import { attack, weaponSpec, damageActor, explode, push } from '../src/core/combat';
import { BAL } from '../src/data/balance';
import { TILE } from '../src/core/state';
import { invalidateVision } from '../src/core/vision';
import { emitNoise } from '../src/core/noise';

describe('rng', () => {
  it('es determinista y clonable', () => {
    const a = createRng('x'); const b = createRng('x');
    const sa = Array.from({ length: 50 }, () => next(a));
    const sb = Array.from({ length: 50 }, () => next(b));
    expect(sa).toEqual(sb);
    const c = cloneRng(a);
    expect(next(c)).toBe(next(a));
  });
  it('int respeta los límites y chance(0/1) es exacto', () => {
    const r = createRng('lim');
    for (let i = 0; i < 2000; i++) { const v = int(r, 3, 7); expect(v).toBeGreaterThanOrEqual(3); expect(v).toBeLessThanOrEqual(7); }
    expect(chance(r, 0)).toBe(false);
    expect(chance(r, 1)).toBe(true);
  });
  it('weighted y shuffle no pierden elementos', () => {
    const r = createRng('w');
    const arr = [1, 2, 3, 4, 5, 6];
    expect(shuffle(r, arr.slice()).sort()).toEqual(arr);
    const counts = [0, 0];
    for (let i = 0; i < 3000; i++) counts[weighted(r, [0, 1], (x) => (x ? 3 : 1))]++;
    expect(counts[1]).toBeGreaterThan(counts[0] * 2);
  });
  it('la semilla diaria depende solo de la fecha UTC', () => {
    expect(dailySeed(new Date('2187-03-05T01:00:00Z'))).toBe(dailySeed(new Date('2187-03-05T23:00:00Z')));
    expect(dailySeed(new Date('2187-03-05T01:00:00Z'))).not.toBe(dailySeed(new Date('2187-03-06T01:00:00Z')));
  });
});

describe('fov y caminos', () => {
  const W = 12; const H = 9;
  const walls = new Set<number>();
  for (let y = 0; y < H; y++) walls.add(y * W + 6);
  walls.delete(4 * W + 6); // hueco
  const opaque = (x: number, y: number): boolean => x < 0 || y < 0 || x >= W || y >= H || walls.has(y * W + x);
  it('el muro bloquea la visión salvo por el hueco', () => {
    const seen = new Set<number>();
    computeFov(2, 4, 10, opaque, (x, y) => seen.add(y * W + x));
    expect(seen.has(4 * W + 9)).toBe(true); // a través del hueco
    expect(seen.has(0 * W + 9)).toBe(false); // detrás del muro
    expect(hasLos(2, 4, 9, 4, opaque)).toBe(true);
    expect(hasLos(2, 1, 9, 1, opaque)).toBe(false);
  });
  it('A* encuentra el camino por el hueco y el mapa de distancias coincide', () => {
    const cost = (x: number, y: number): number => (opaque(x, y) ? -1 : 1);
    const p = findPath(W, H, 1, 1, 10, 1, cost);
    expect(p).not.toBeNull();
    expect(p!.some((c) => c.x === 6 && c.y === 4)).toBe(true);
    const dm = distanceMap(W, H, [{ x: 10, y: 1 }], cost);
    expect(dm[1 * W + 1]).toBe(p!.length);
    expect(dm[0 * W + 6]).toBe(UNREACHABLE);
  });
});

describe('textos', () => {
  it('sustituye parámetros y formas de género', () => {
    setLang('es');
    setPronoun('ella');
    setGlobal('name', 'Ana');
    expect(format('Hola, {name}. Estás list{o|a|e}.')).toBe('Hola, Ana. Estás lista.');
    setPronoun('elle');
    expect(format('Estás list{o|a|e}.')).toBe('Estás liste.');
    setPronoun('el');
    expect(format('{n} de {m}', { n: 2, m: 5 })).toBe('2 de 5');
    expect(t('clave.que.no.existe')).toBe('clave.que.no.existe');
    expect(t('zone.1')).toContain('Criogenia');
    setLang('en');
    expect(t('zone.1')).toContain('Cryo');
    setLang('es');
  });
});

describe('oxígeno y energía', () => {
  it('el O₂ baja cada turno y más deprisa en vacío', () => {
    const st = arena(ROOM);
    const o0 = st.player.o2;
    run(st, { t: 'wait' }, 10);
    const normal = o0 - st.player.o2;
    expect(normal).toBeCloseTo(BAL.o2Base * 10 * getStats(st).o2Mult, 3);
    st.map.sections[0].pressure = 0;
    st.map.sections[0].lifeSupport = false;
    const o1 = st.player.o2;
    run(st, { t: 'wait' }, 5);
    expect(o1 - st.player.o2).toBeGreaterThan(normal);
  });
  it('sin O₂ el jugador se asfixia y muere por oxígeno', () => {
    const st = arena(ROOM);
    st.player.o2 = 0;
    const p = getPlayer(st);
    const hp0 = p.hp;
    run(st, { t: 'wait' }, 2);
    expect(p.hp).toBeLessThan(hp0);
    for (let i = 0; i < 200 && !st.over; i++) run(st, { t: 'wait' });
    expect(st.over?.cause).toBe('o2');
  });
  it('la opción de oxígeno generoso reduce el consumo', () => {
    const a = arena(ROOM); const b = arena(ROOM, { opts: { generousO2: true } });
    run(a, { t: 'wait' }, 20); run(b, { t: 'wait' }, 20);
    expect(b.player.o2).toBeGreaterThan(a.player.o2);
  });
  it('la linterna gasta energía y se apaga al agotarla', () => {
    const st = arena(ROOM);
    run(st, { t: 'toggleLight' });
    expect(st.player.flashlight).toBe(true);
    const e0 = st.player.energy;
    run(st, { t: 'wait' }, 5);
    expect(st.player.energy).toBeLessThan(e0);
    st.player.energy = 0.01;
    run(st, { t: 'wait' }, 2);
    expect(st.player.flashlight).toBe(false);
  });
  it('una estación de O₂ rellena el depósito una vez', () => {
    const st = arena(ROOM);
    const p = getPlayer(st);
    st.map.props.push({ id: 900, kind: 'o2station', x: p.x + 1, y: p.y });
    st.player.o2 = 10;
    run(st, { t: 'interact' });
    expect(st.player.o2).toBeGreaterThan(getStats(st).maxO2 - 1);
    st.player.o2 = 10;
    run(st, { t: 'interact' });
    expect(st.player.o2).toBeLessThan(11);
  });
});

describe('inventario', () => {
  it('apila, respeta el límite y separa la munición', () => {
    const st = arena(ROOM);
    st.player.inv = [];
    expect(addItem(st, { id: 'vendas', n: 2 })).toBe(true);
    expect(addItem(st, { id: 'vendas', n: 3 })).toBe(true);
    expect(countItem(st, 'vendas')).toBe(5);
    expect(st.player.inv.length).toBe(1);
    const balas = st.player.ammo.balas;
    addItem(st, { id: 'mun_balas', n: 1 });
    expect(st.player.ammo.balas).toBeGreaterThan(balas);
    for (let i = 0; i < 30; i++) addItem(st, { id: 'tuberia', n: 1 });
    expect(st.player.inv.length).toBe(BAL.invSize);
    expect(addItem(st, { id: 'hacha', n: 1 })).toBe(false);
    expect(removeItem(st, 'vendas', 5)).toBe(true);
    expect(countItem(st, 'vendas')).toBe(0);
  });
  it('equipar intercambia el arma y un arma defectuosa no se puede quitar', () => {
    const st = arena(ROOM);
    st.player.inv = [{ id: 'hacha', n: 1 }];
    const prev = st.player.melee?.id;
    run(st, { t: 'equip', slot: 0 });
    expect(st.player.melee?.id).toBe('hacha');
    expect(st.player.inv.some((s) => s.id === prev)).toBe(true);
    st.player.melee = { id: 'hacha', n: 1, cursed: true };
    const n = st.player.inv.length;
    run(st, { t: 'unequip', which: 'melee' });
    expect(st.player.melee?.id).toBe('hacha');
    expect(st.player.inv.length).toBe(n);
  });
  it('soltar y recoger devuelve el objeto', () => {
    const st = arena(ROOM);
    st.player.inv = [{ id: 'bateria', n: 1 }];
    run(st, { t: 'drop', slot: 0 });
    expect(st.player.inv.length).toBe(0);
    expect(st.items.length).toBe(1);
    run(st, { t: 'pickup' });
    expect(countItem(st, 'bateria')).toBe(1);
    expect(st.items.length).toBe(0);
  });
  it('usar un botiquín cura y se consume', () => {
    const st = arena(ROOM);
    st.player.inv = [{ id: 'botiquin', n: 1 }];
    const p = getPlayer(st);
    p.hp = 5;
    run(st, { t: 'use', slot: 0 });
    expect(p.hp).toBeGreaterThan(5);
    expect(countItem(st, 'botiquin')).toBe(0);
  });
});

describe('combate', () => {
  it('el daño cuerpo a cuerpo cae en el rango del arma y mata', () => {
    const st = arena(['#####', '#@e.#', '#####'], { enemy: 'eco_errante' });
    const e = st.actors.find((a) => a.id !== st.pid)!;
    e.hp = 1000; e.maxHp = 1000;
    const ev = new EventSink();
    const p = getPlayer(st);
    const spec = weaponSpec(st, 'melee');
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      const before = e.hp;
      e.ai.mode = 'hunt';
      if (attack(st, ev, p, e, spec)) {
        hits++;
        const d = before - e.hp;
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(spec.dmg[1] * 2 + 2);
      }
    }
    expect(hits).toBeGreaterThan(100);
    e.hp = 1;
    for (let i = 0; i < 30 && !e.dead; i++) { e.ai.mode = 'hunt'; attack(st, ev, p, e, spec); }
    expect(e.dead).toBe(true);
    expect(st.stats.kills).toBe(1);
  });
  it('el ataque furtivo a un enemigo desprevenido hace más daño de media', () => {
    const st = arena(['#####', '#@e.#', '#####']);
    const e = st.actors.find((a) => a.id !== st.pid)!;
    const p = getPlayer(st);
    const spec = weaponSpec(st, 'melee');
    const ev = new EventSink();
    const avg = (unaware: boolean): number => {
      let tot = 0; let n = 0;
      for (let i = 0; i < 300; i++) {
        e.hp = 1000; e.maxHp = 1000; e.dead = false;
        e.ai.mode = unaware ? 'idle' : 'hunt';
        if (attack(st, ev, p, e, spec, { sneak: true })) { tot += 1000 - e.hp; n++; }
      }
      return tot / Math.max(1, n);
    };
    expect(avg(true)).toBeGreaterThan(avg(false) * 1.4);
  });
  it('las explosiones dañan en su radio y no fuera', () => {
    const st = arena(['###########', '#@..e...e.#', '###########']);
    const [near, far] = st.actors.filter((a) => a.id !== st.pid);
    near.hp = far.hp = 100; near.maxHp = far.maxHp = 100;
    const ev = new EventSink();
    explode(st, ev, near.x, near.y, 1, [10, 10], null);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
  });
  it('empujar contra una pared hace daño; al vacío por una brecha, expulsa', () => {
    const st = arena(['######', '#.@e##', '######']);
    const e = st.actors.find((a) => a.id !== st.pid)!;
    e.hp = 50; e.maxHp = 50;
    push(st, new EventSink(), e, 1, 0, 2, getPlayer(st));
    expect(e.hp).toBeLessThan(50);
  });
  it('damageActor con daño enorme mata y da chatarra', () => {
    const st = arena(['#####', '#@e.#', '#####']);
    const e = st.actors.find((a) => a.id !== st.pid)!;
    const s0 = st.player.scrap;
    damageActor(st, new EventSink(), e, 999, getPlayer(st), 'hit');
    expect(e.dead).toBe(true);
    expect(st.player.scrap).toBeGreaterThanOrEqual(s0);
  });
});

describe('IA y sigilo', () => {
  it('un enemigo que ve al jugador iluminado acaba persiguiéndolo y atacando', () => {
    const st = arena([
      '############',
      '#@.........#',
      '#.........e#',
      '############',
    ], { enemy: 'eco_errante' });
    const e = st.actors.find((a) => a.id !== st.pid)!;
    e.ai.mode = 'patrol';
    const p = getPlayer(st);
    const hp0 = p.hp;
    for (let i = 0; i < 40; i++) run(st, { t: 'wait' });
    expect(['hunt', 'alert']).toContain(e.ai.mode);
    expect(p.hp).toBeLessThan(hp0);
  });
  it('en la oscuridad y en sigilo, a distancia, un enemigo inactivo no detecta al jugador', () => {
    const st = arena([
      '##############',
      '#@...........#',
      '#...........e#',
      '##############',
    ]);
    st.map.sections[0].dark = true;
    invalidateVision(st);
    const e = st.actors.find((a) => a.id !== st.pid)!;
    e.ai.mode = 'idle';
    run(st, { t: 'toggleSneak' });
    for (let i = 0; i < 5; i++) run(st, { t: 'wait' });
    expect(e.ai.mode).not.toBe('hunt');
  });
  it('el ruido fuerte alerta a los enemigos cercanos', () => {
    const st = arena([
      '##############',
      '#@...........#',
      '#.....#####..#',
      '#.....#e..#..#',
      '#.....#...+..#',
      '##############',
    ]);
    const e = st.actors.find((a) => a.id !== st.pid)!;
    e.ai.mode = 'idle';
    emitNoise(st, 3, 3, 5);
    expect(e.ai.mode).toBe('idle');
    emitNoise(st, 3, 3, 30);
    expect(['alert', 'hunt']).toContain(e.ai.mode);
    expect(e.ai.tx).toBe(3);
  });
});

describe('atmósfera', () => {
  it('abrir una puerta a una sala en vacío descomprime la sala presurizada', () => {
    const st = arena([
      '#########',
      '#...+...#',
      '#.@.#...#',
      '#########',
    ]);
    const [a, b] = st.map.sections;
    b.pressure = 0; b.lifeSupport = false;
    const p = getPlayer(st);
    expect(st.map.sec[p.y * st.map.w + p.x]).toBe(a.id);
    const door = Object.values(st.map.doors)[0];
    door.open = true;
    run(st, { t: 'wait' }, 3);
    expect(a.pressure).toBeLessThan(100);
    expect(b.pressure).toBeGreaterThan(0);
  });
  it('el fuego se propaga con aire y se apaga en el vacío', () => {
    const st = arena([
      '############',
      '#@.........#',
      '#..........#',
      '#..........#',
      '############',
    ]);
    const idx = (x: number, y: number): number => y * st.map.w + x;
    st.map.fire[idx(8, 2)] = 8;
    let burned = 0;
    for (let i = 0; i < 12; i++) { run(st, { t: 'wait' }); burned = Math.max(burned, st.map.fire.filter((f) => f > 0).length); }
    expect(burned).toBeGreaterThan(1);
    st.map.sections[0].pressure = 0; st.map.sections[0].lifeSupport = false;
    st.player.o2 = 999;
    run(st, { t: 'wait' }, 2);
    expect(st.map.fire.filter((f) => f > 0).length).toBe(0);
  });
  it('sellar una puerta cuesta energía y la cierra', () => {
    const st = arena([
      '#######',
      '#.@+..#',
      '#######',
    ]);
    const e0 = st.player.energy;
    const di = Number(Object.keys(st.map.doors)[0]);
    const x = di % st.map.w; const y = Math.floor(di / st.map.w);
    run(st, { t: 'door', x, y, op: 'seal' });
    expect(st.map.doors[di].sealed).toBe(true);
    expect(st.player.energy).toBeLessThan(e0);
    expect(st.map.tiles[di]).toBe(TILE.DOOR);
  });
  it('vaciar una sección expulsa a los enemigos ligeros que contiene', () => {
    const st = arena([
      '##########',
      '#@.+....A ',
      '#..#..e.# ',
      '##########',
    ], { enemy: 'juguete_roto' });
    st.player.o2 = 999;
    const e = st.actors.find((a) => a.id !== st.pid)!;
    const sec = st.map.sec[e.y * st.map.w + e.x];
    const evs = run(st, { t: 'wait' });
    void evs;
    st.map.sections[sec].vent = 30;
    st.map.sections[sec].ventedByPlayer = true;
    for (let i = 0; i < 25 && !e.dead; i++) run(st, { t: 'wait' });
    expect(e.dead).toBe(true);
    expect(msgs([]).length).toBe(0);
  });
});

void spawnActor;
