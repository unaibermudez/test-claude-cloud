import { describe, it, expect } from 'vitest';
import { createRun, defaultOptions, emptyMeta, step, debugWarp } from '../src/core/game';
import { serializeRun, deserializeRun, serializeMeta, deserializeMeta, exportAll, importAll, migrate, META_MIGRATIONS } from '../src/core/save';
import { newMeta, buyUpgrade, upgradeState, finishRun, classUnlocked, startZones, snapshotFor, modeUnlocked, checkAchievements } from '../src/core/meta';
import { createHack, validPicks, hackPick, solveNext } from '../src/core/hack';
import { createRng } from '../src/core/rng';
import { evalCond, startScene, chooseOption, visibleOptions, availableEndings, currentNode } from '../src/core/narrative';
import { EventSink } from '../src/core/events';
import { botDecide, newBotMemory, playRun } from '../src/sim/bot';
import { UPGRADES } from '../src/data/upgrades';
import { SCENES } from '../src/data/scenes';
import { getPlayer } from '../src/core/actors';
import { getStats } from '../src/core/rules';
import { arena, run, ROOM } from './helpers';

const opts = (seed: string): ReturnType<typeof defaultOptions> => defaultOptions({ seed });

describe('determinismo', () => {
  it('misma semilla y mismas acciones producen el mismo estado', () => {
    const a = createRun(opts('det'), emptyMeta(), []);
    const b = createRun(opts('det'), emptyMeta(), []);
    const ma = newBotMemory(); const mb = newBotMemory();
    for (let i = 0; i < 400 && !a.over; i++) {
      step(a, botDecide(a, 'prudente', ma));
      step(b, botDecide(b, 'prudente', mb));
    }
    expect(serializeRun(a)).toBe(serializeRun(b));
  });
  it('semillas distintas generan pisos distintos', () => {
    const a = createRun(opts('s1'), emptyMeta(), []);
    const b = createRun(opts('s2'), emptyMeta(), []);
    expect(a.map.tiles.join()).not.toBe(b.map.tiles.join());
  });
});

describe('guardado', () => {
  it('guardar y cargar a mitad de partida continúa idéntico (sin trampas de guardado)', () => {
    const a = createRun(opts('save'), emptyMeta(), []);
    const mem = newBotMemory();
    for (let i = 0; i < 150; i++) step(a, botDecide(a, 'prudente', mem));
    const raw = serializeRun(a);
    const b = deserializeRun(raw)!;
    expect(b).not.toBeNull();
    const memA = newBotMemory(); const memB = newBotMemory();
    for (let i = 0; i < 200 && !a.over; i++) {
      step(a, botDecide(a, 'agresivo', memA));
      step(b, botDecide(b, 'agresivo', memB));
    }
    expect(serializeRun(b)).toBe(serializeRun(a));
  });
  it('rechaza datos ajenos o de versiones futuras', () => {
    expect(deserializeRun(null)).toBeNull();
    expect(deserializeRun(JSON.stringify({ game: 'otro', kind: 'run', v: 1, data: {} }))).toBeNull();
    expect(deserializeRun(JSON.stringify({ game: 'deriva', kind: 'run', v: 999, data: {} }))).toBeNull();
    expect(() => deserializeMeta(JSON.stringify({ game: 'deriva', kind: 'meta', v: 999, data: {} }))).toThrow();
  });
  it('migra una meta v1 a la versión actual', () => {
    const v1 = { game: 'deriva', kind: 'meta', v: 1, data: { memorias: 42, upgrades: ['sv1'], logs: ['R01'], stats: { runs: 3 } } };
    const m = deserializeMeta(JSON.stringify(v1));
    expect(m.memorias).toBe(42);
    expect(m.classesPlayed).toEqual([]);
    expect(m.history).toEqual([]);
    expect(m.stats.runs).toBe(3);
    expect(m.stats.deaths).toBe(0);
    expect(migrate({ a: 1 }, 1, 2, META_MIGRATIONS).version).toBe(2);
  });
  it('exporta e importa meta y partida', () => {
    const meta = newMeta();
    meta.memorias = 77;
    meta.logs.push('R05');
    const r = createRun(opts('exp'), snapshotFor(meta), []);
    const back = importAll(exportAll(meta, r));
    expect(back.meta.memorias).toBe(77);
    expect(back.meta.logs).toContain('R05');
    expect(back.run?.seed).toBe('exp');
    expect(deserializeMeta(serializeMeta(meta)).memorias).toBe(77);
    expect(() => importAll('{"game":"otro"}')).toThrow();
  });
});

describe('árbol de mejoras y meta', () => {
  it('respeta requisitos y coste', () => {
    const m = newMeta();
    expect(upgradeState(m, 'sv1')).toBe('expensive');
    m.memorias = 1000;
    expect(upgradeState(m, 'sv2')).toBe('locked');
    expect(buyUpgrade(m, 'sv2')).toBe(false);
    expect(buyUpgrade(m, 'sv1')).toBe(true);
    expect(buyUpgrade(m, 'sv1')).toBe(false);
    expect(buyUpgrade(m, 'sv2')).toBe(true);
    expect(m.memorias).toBeLessThan(1000);
  });
  it('todos los nodos son comprables con suficientes Memorias y banderas', () => {
    const m = newMeta();
    m.memorias = 1e6;
    for (const f of ['boss_hipnos', 'boss_demeter', 'boss_flegetonte', 'boss_cocito', 'ending_liberacion']) m.flags[f] = 1;
    m.arcs.faro = 4;
    for (let pass = 0; pass < 10; pass++) for (const u of UPGRADES) buyUpgrade(m, u.id);
    expect(m.upgrades.length).toBe(UPGRADES.length);
  });
  it('las mejoras modifican la partida y desbloquean clases y zonas', () => {
    const m = newMeta();
    expect(classUnlocked(m, 'tecnico')).toBe(true);
    expect(classUnlocked(m, 'medico')).toBe(false);
    m.memorias = 1e6;
    for (const id of ['sv1', 'sv3', 'sv8']) buyUpgrade(m, id);
    expect(classUnlocked(m, 'medico')).toBe(true);
    const base = createRun(opts('perk'), emptyMeta(), []);
    const withP = createRun(opts('perk'), emptyMeta(), ['sv1']);
    expect(getStats(withP).maxO2).toBeGreaterThan(getStats(base).maxO2);
    expect(startZones(m)).toEqual([1]);
    expect(modeUnlocked(m, 'pesadilla')).toBe(false);
    m.endings.push('olvido');
    expect(modeUnlocked(m, 'pesadilla')).toBe(true);
  });
  it('terminar una partida suma Memorias, estadísticas, bestiario e historial', () => {
    const m = newMeta();
    const st = createRun(opts('fin'), snapshotFor(m), []);
    const r = playRun(st, 'prudente', 3000);
    expect(r).toBeTruthy();
    if (!st.over) st.over = { cause: 'abandon', ending: null, victory: false };
    const res = finishRun(m, st, 1000);
    expect(m.stats.runs).toBe(1);
    expect(m.memorias).toBeGreaterThan(0);
    expect(m.history.length).toBe(1);
    expect(res.summary.memorias).toBe(m.memorias);
    expect(res.achievements).toContain('first_death');
    expect(checkAchievements(m)).toEqual([]);
  });
});

describe('hackeo', () => {
  it('siempre es resoluble siguiendo la solución (500 semillas, todas las dificultades)', () => {
    for (let i = 0; i < 500; i++) {
      const h = createHack(createRng(`h${i}`), 1 + (i % 5), i % 3);
      let guard = 0;
      while (!h.success && guard++ < 20) {
        const c = solveNext(h);
        expect(validPicks(h)).toContain(c);
        expect(hackPick(h, c)).toBe(true);
      }
      expect(h.success).toBe(true);
      expect(h.targets[0].done).toBe(true);
    }
  });
  it('rechaza elecciones fuera de la línea activa', () => {
    const h = createHack(createRng('bad'), 3, 0);
    const valid = new Set(validPicks(h));
    const invalid = Array.from({ length: h.n * h.n }, (_, i) => i).find((i) => !valid.has(i))!;
    expect(hackPick(h, invalid)).toBe(false);
  });
  it('un terminal hackeado desde la partida da acceso a sus operaciones', () => {
    const st = arena(ROOM);
    const p = getPlayer(st);
    st.map.props.push({ id: 901, kind: 'terminal', x: p.x + 1, y: p.y, hack: 2 });
    run(st, { t: 'interact' });
    expect(st.modal?.kind).toBe('terminal');
    run(st, { t: 'termOp', op: 'hack' });
    expect(st.modal?.kind).toBe('hack');
    let guard = 0;
    while (st.modal?.kind === 'hack' && !st.modal.hack.success && guard++ < 20) {
      const h = st.modal.hack;
      run(st, { t: 'hack', cell: solveNext(h) });
    }
    if (st.modal?.kind === 'hack') run(st, { t: 'hackAbort' });
    expect(st.modal?.kind).toBe('terminal');
    expect(st.map.props.find((q) => q.id === 901)?.hacked).toBe(true);
  });
});

describe('narrativa y finales', () => {
  it('evalúa condiciones compuestas', () => {
    const st = arena(ROOM);
    st.narrative.trust = 55;
    st.narrative.flags.x = 2;
    expect(evalCond(st, { all: [{ trustGte: 50 }, { flag: 'x', gte: 2 }] })).toBe(true);
    expect(evalCond(st, { any: [{ trustGte: 90 }, { not: { flag: 'y' } }] })).toBe(true);
    expect(evalCond(st, { flag: 'x', eq: 1 })).toBe(false);
  });
  it('una escena de PNJ avanza su arco en la meta de la partida', () => {
    const st = arena(ROOM);
    const ev = new EventSink();
    const sc = SCENES.find((s) => s.id === 'celia_c1')!;
    startScene(st, ev, sc.id);
    expect(st.modal?.kind).toBe('dialog');
    expect(st.metaSnapshot.arcs.celia).toBe(1);
    let guard = 0;
    while (st.modal && guard++ < 20) {
      const opts2 = visibleOptions(st);
      chooseOption(st, ev, opts2.length ? opts2[opts2.length - 1].index : 0);
    }
    expect(st.modal).toBeNull();
  });
  it('olvido siempre está disponible; los demás finales dependen de sus condiciones', () => {
    const st = arena(ROOM);
    st.narrative.trust = 10;
    expect(availableEndings(st)).toEqual(['olvido']);
    st.narrative.trust = 70;
    st.narrative.flags.truth_known = 1;
    st.narrative.flags.pods_ready = 1;
    const av = availableEndings(st);
    expect(av).toContain('custodia');
    expect(av).toContain('redencion');
    expect(av).toContain('evacuacion');
    expect(av).not.toContain('verdadero');
  });
  it('elegir un final en el Núcleo termina la partida con victoria', () => {
    const st = createRun(opts('core'), emptyMeta(), []);
    debugWarp(st, 5, 4);
    const ev = new EventSink();
    startScene(st, ev, 'core');
    const olvido = visibleOptions(st).find((o) => o.opt.next === 'c_olvido')!;
    chooseOption(st, ev, olvido.index);
    expect(currentNode(st)?.node.speaker).toBe('agora');
    chooseOption(st, ev, 0);
    expect(st.over).toEqual({ cause: 'ending', ending: 'olvido', victory: true });
    const m = newMeta();
    finishRun(m, st);
    expect(m.endings).toContain('olvido');
    expect(m.flags.olvido_seen).toBe(1);
    expect(m.stats.victories).toBe(1);
  });
  it('las muertes especiales producen su final', () => {
    const st = arena(ROOM);
    st.orbit = 1;
    for (let i = 0; i < 5 && !st.over; i++) run(st, { t: 'wait' });
    expect(st.over?.ending).toBe('caida');
    const s2 = arena(ROOM);
    s2.map.sections[0].pressure = 0;
    s2.map.sections[0].lifeSupport = false;
    s2.map.sections[0].ventedByPlayer = true;
    s2.player.o2 = 0;
    for (let i = 0; i < 300 && !s2.over; i++) run(s2, { t: 'wait' });
    expect(s2.over?.ending).toBe('respiracion');
  });
});

describe('simulación', () => {
  it('el bot completa partidas sin excepciones con las tres estrategias', () => {
    for (const [i, strat] of (['agresivo', 'sigilo', 'prudente'] as const).entries()) {
      for (let k = 0; k < 4; k++) {
        const st = createRun(defaultOptions({ seed: `sim${i}-${k}`, classId: ['tecnico', 'infiltrado', 'soldador', 'medico'][k] }), emptyMeta(), []);
        const r = playRun(st, strat, 6000);
        expect(r.turns).toBeGreaterThan(0);
      }
    }
  });
});
