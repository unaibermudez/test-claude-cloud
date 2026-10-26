/**
 * Escenas narrativas (arcos de PNJ, eventos morales, radio, finales).
 * Los textos se derivan automáticamente: nodo → `sc.<escena>.<nodo>`, opción → `sc.<escena>.<nodo>.<i>`.
 * Título: `sc.<escena>.title`.
 */
import type { SceneDef, DialogNode, Effect, Cond, SpeakerId, NpcId } from '../core/content';

type Opt = [next: string | null, fx?: Effect[], cond?: Cond];
interface N { sp: SpeakerId; o?: Opt[]; nx?: string | null; fx?: Effect[] }

function S(id: string, kind: SceneDef['kind'], meta: Partial<Omit<SceneDef, 'id' | 'kind' | 'nodes' | 'start' | 'title'>> & { zones: number[] }, nodes: Record<string, N>): SceneDef {
  const out: Record<string, DialogNode> = {};
  for (const [nid, n] of Object.entries(nodes)) {
    out[nid] = {
      speaker: n.sp,
      text: `sc.${id}.${nid}`,
      effects: n.fx,
      next: n.nx ?? null,
      options: n.o?.map(([next, fx, cond], i) => ({ text: `sc.${id}.${nid}.${i}`, next, effects: fx, cond })),
    };
  }
  return { id, kind, ...meta, start: Object.keys(nodes)[0], nodes: out, title: `sc.${id}.title` };
}

const npc = (id: string, who: NpcId, stage: number, zones: number[], nodes: Record<string, N>, extra: Partial<SceneDef> = {}): SceneDef =>
  S(id, 'npc', { npc: who, stage, zones, ...extra }, nodes);

// ================================================================== Celia Arrieta
const CELIA: SceneDef[] = [
  npc('celia_c1', 'celia', 0, [1], {
    n1: { sp: 'celia', nx: 'n2' },
    n2: { sp: 'celia', o: [['n3'], ['n4', [{ flag: 'celia_tremor' }]], [null]] },
    n3: { sp: 'celia', nx: 'n5' },
    n4: { sp: 'celia', nx: 'n5' },
    n5: { sp: 'celia', fx: [{ heal: 10 }], o: [[null, [{ meta: 'celia_promise' }]], [null]] },
  }, { setsStage: 1 }),
  npc('celia_c2', 'celia', 1, [1, 2], {
    n1: { sp: 'narrator', nx: 'n2' },
    n2: { sp: 'celia', o: [['n3', [{ meta: 'celia_secret' }]], ['n4', [{ trust: 8 }, { fate: 'celia', v: 'contained' }, { meta: 'celia_contained' }, { removeNpc: true }]], ['n5', [{ meta: 'celia_cure' }]]] },
    n3: { sp: 'celia', nx: null },
    n4: { sp: 'agora', nx: 'n6' },
    n6: { sp: 'celia', nx: null },
    n5: { sp: 'celia', nx: null },
  }, { setsStage: 2 }),
  npc('celia_c3', 'celia', 2, [2, 3], {
    n1: { sp: 'celia', o: [['n2', [{ take: 'muestra_micelio' }, { arc: 'celia', stage: 3 }]], ['n3']] },
    n2: { sp: 'celia', nx: null },
    n3: { sp: 'celia', nx: null },
  }, { repeat: true, cond: { not: { meta: 'celia_contained' } } }),
  npc('celia_c4', 'celia', 3, [3, 4, 5], {
    n1: { sp: 'celia', nx: 'n2' },
    n2: { sp: 'celia', fx: [{ fate: 'celia', v: 'saved' }, { survivors: 1 }, { meta: 'celia_saved' }, { arc: 'celia', stage: 4 }], nx: null },
  }),
  npc('celia_c4b', 'celia', 2, [4], {
    n1: { sp: 'narrator', nx: 'n2' },
    n2: { sp: 'celia', o: [['n3', [{ fate: 'celia', v: 'lost' }, { arc: 'celia', stage: 4 }, { noise: 5 }]], ['n4', [{ fate: 'celia', v: 'released' }, { arc: 'celia', stage: 4 }, { meta: 'celia_released' }]], ['n4', [{ fate: 'celia', v: 'released' }, { arc: 'celia', stage: 4 }]]] },
    n3: { sp: 'celia', fx: [{ removeNpc: true }], nx: null },
    n4: { sp: 'celia', fx: [{ removeNpc: true }], nx: null },
  }, { cond: { all: [{ not: { meta: 'celia_contained' } }, { not: { has: 'muestra_micelio' } }] } }),
];

// ================================================================== Tomás Ibarra
const TOMAS: SceneDef[] = [
  S('tomas_i1', 'radio', { npc: 'tomas', stage: 0, zones: [3], floors: [1, 2], setsStage: 1 }, {
    n1: { sp: 'tomas', o: [['n2'], ['n3'], [null]] },
    n2: { sp: 'tomas', nx: null },
    n3: { sp: 'tomas', nx: null },
  }),
  npc('tomas_i2', 'tomas', 1, [3], {
    n1: { sp: 'tomas', nx: 'n2' },
    n2: { sp: 'tomas', o: [['n3', [{ meta: 'tomas_respect' }]], ['n4'], ['n5', [{ flag: 'tomas_lie' }]], ['n7', [{ take: 'mensaje_samuel' }, { meta: 'tomas_heard' }], { has: 'mensaje_samuel' }]] },
    n3: { sp: 'tomas', nx: 'n6' },
    n4: { sp: 'tomas', nx: 'n6' },
    n5: { sp: 'tomas', nx: 'n6' },
    n7: { sp: 'tomas', nx: 'n6' },
    n6: { sp: 'tomas', fx: [{ flag: 'valve_code' }, { give: 'bateria' }], nx: null },
  }, { setsStage: 2, floors: [1, 2, 3] }),
  S('tomas_i3', 'radio', { npc: 'tomas', stage: 2, zones: [4], floors: [1, 2], cond: { all: [{ flag: 'boss_flegetonte' }, { not: { flag: 'tomas_locked' } }] } }, {
    n1: { sp: 'tomas', o: [['n2', [{ take: 'anillo_samuel' }, { flag: 'pods_ready' }, { arc: 'tomas', stage: 3 }, { meta: 'tomas_pods' }], { has: 'anillo_samuel' }], ['n3']] },
    n2: { sp: 'tomas', nx: null },
    n3: { sp: 'tomas', nx: null },
  }),
  S('tomas_i4', 'radio', { npc: 'tomas', stage: 3, zones: [5], floors: [1, 2, 3], setsStage: 4 }, {
    n1: { sp: 'tomas', fx: [{ flag: 'pods_ready' }], o: [['n2', [{ fate: 'tomas', v: 'saved' }, { survivors: 1 }]], ['n3', [{ fate: 'tomas', v: 'sacrifice' }]]] },
    n2: { sp: 'tomas', nx: null },
    n3: { sp: 'tomas', nx: null },
  }),
];

// ================================================================== Bruno Lenz y el Capitán Tuerca
const BRUNO: SceneDef[] = [
  npc('bruno_b1', 'bruno', 0, [1], {
    n1: { sp: 'tuerca', nx: 'n2' },
    n2: { sp: 'narrator', o: [['n3'], ['n4', [{ take: 'raciones' }, { meta: 'bruno_food' }], { has: 'raciones' }], ['n5']] },
    n3: { sp: 'tuerca', nx: 'n6' },
    n4: { sp: 'tuerca', nx: 'n6' },
    n5: { sp: 'tuerca', nx: 'n6' },
    n6: { sp: 'tuerca', nx: null },
  }, { setsStage: 1 }),
  npc('bruno_b2', 'bruno', 1, [1, 2], {
    n1: { sp: 'tuerca', o: [['n2'], ['n3']] },
    n2: { sp: 'tuerca', nx: 'n3' },
    n3: { sp: 'tuerca', nx: null },
  }, { setsStage: 2 }),
  npc('bruno_b3', 'bruno', 2, [2, 3, 4], {
    n1: { sp: 'narrator', nx: 'n2' },
    n2: { sp: 'tuerca', o: [['n3'], ['n4']] },
    n3: { sp: 'tuerca', nx: 'n5' },
    n4: { sp: 'tuerca', nx: 'n5' },
    n5: { sp: 'tuerca', fx: [{ arc: 'bruno', stage: 3 }, { meta: 'bruno_freq' }, { take: 'caja_musica' }], nx: null },
  }, { repeat: true, cond: { has: 'caja_musica' } }),
  npc('bruno_b4', 'bruno', 3, [4, 5], {
    n1: { sp: 'narrator', nx: 'n2' },
    n2: { sp: 'lenz', nx: 'n3' },
    n3: { sp: 'bruno', nx: 'n4' },
    n4: { sp: 'lenz', nx: 'n5' },
    n5: { sp: 'bruno', o: [['n6'], ['n6'], ['n8', [{ take: 'dibujo_bruno' }, { meta: 'drawing_given' }], { has: 'dibujo_bruno' }]] },
    n8: { sp: 'bruno', nx: 'n6' },
    n6: { sp: 'lenz', fx: [{ arc: 'bruno', stage: 4 }, { meta: 'bruno_voice' }], nx: 'n7' },
    n7: { sp: 'bruno', nx: null },
  }, { cond: { arcGte: ['lenz', 2] } }),
];

// ================================================================== Teniente Marga Solís
const SOLIS: SceneDef[] = [
  npc('solis_s1', 'solis', 0, [1], {
    n1: { sp: 'solis', o: [['n2', [{ meta: 'solis_honest' }]], ['n3'], ['n2']] },
    n2: { sp: 'solis', nx: 'n4' },
    n3: { sp: 'solis', nx: 'n4' },
    n4: { sp: 'solis', fx: [{ removeNpc: true }], nx: null },
  }, { setsStage: 1, floors: [2, 3] }),
  npc('solis_s2', 'solis', 1, [2, 3], {
    n1: { sp: 'solis', o: [['n2', [{ meta: 'solis_respect' }]], ['n3'], ['n4', [{ meta: 'solis_enemy' }, { hostileNpc: true }]]] },
    n2: { sp: 'solis', fx: [{ removeNpc: true }], nx: null },
    n3: { sp: 'solis', fx: [{ removeNpc: true }], nx: null },
    n4: { sp: 'solis', nx: null },
  }, { setsStage: 2 }),
  npc('solis_s3', 'solis', 2, [4, 5], {
    n1: { sp: 'solis', o: [
      ['n2', [{ arc: 'solis', stage: 3 }, { meta: 'solis_ally' }, { fate: 'solis', v: 'ally' }], { any: [{ flag: 'truth_known' }, { flag: 'truth_hint' }, { meta: 'truth_seen' }] }],
      ['n5', [{ take: 'firma_ferran' }, { arc: 'solis', stage: 3 }, { meta: 'solis_ally' }, { fate: 'solis', v: 'ally' }, { flag: 'signature_given' }], { has: 'firma_ferran' }],
      ['n3', [{ arc: 'solis', stage: 3 }, { meta: 'solis_enemy' }, { fate: 'solis', v: 'enemy' }]],
    ] },
    n2: { sp: 'solis', nx: 'n4' },
    n5: { sp: 'solis', nx: 'n4' },
    n4: { sp: 'solis', fx: [{ removeNpc: true }], nx: null },
    n3: { sp: 'solis', fx: [{ removeNpc: true }], nx: null },
  }, { cond: { any: [{ flag: 'truth_known' }, { flag: 'truth_hint' }, { meta: 'truth_seen' }, { has: 'firma_ferran' }] } }),
  npc('solis_s4a', 'solis', 3, [5], {
    n1: { sp: 'solis', fx: [{ flag: 'solis_cover' }, { arc: 'solis', stage: 4 }, { removeNpc: true }], nx: null },
  }, { cond: { all: [{ meta: 'solis_ally' }, { not: { meta: 'solis_enemy' } }] } }),
  npc('solis_s4b', 'solis', 3, [5], {
    n1: { sp: 'solis', o: [['n2'], ['n3']] },
    n2: { sp: 'solis', fx: [{ hostileNpc: true }], nx: null },
    n3: { sp: 'solis', fx: [{ hostileNpc: true }], nx: null },
  }, { cond: { meta: 'solis_enemy' } }),
];

// ================================================================== Dr. Ezra Lenz
const LENZ: SceneDef[] = [
  npc('lenz_l1', 'lenz', 0, [2], {
    n1: { sp: 'lenz', nx: 'n2' },
    n2: { sp: 'lenz', o: [['n3'], ['n4']] },
    n3: { sp: 'lenz', nx: 'n4' },
    n4: { sp: 'lenz', fx: [{ reveal: true }], nx: null },
  }, { setsStage: 1 }),
  npc('lenz_l2', 'lenz', 1, [3], {
    n1: { sp: 'lenz', o: [['n2', [{ trust: -10 }, { flag: 'relay_cut' }, { arc: 'lenz', stage: 2 }, { meta: 'lenz_relay' }]], ['n3'], ['n4', [{ arc: 'lenz', stage: 2 }]]] },
    n3: { sp: 'lenz', o: [['n2', [{ trust: -10 }, { flag: 'relay_cut' }, { arc: 'lenz', stage: 2 }, { meta: 'lenz_relay' }]], ['n4', [{ arc: 'lenz', stage: 2 }]]] },
    n2: { sp: 'agora', nx: null },
    n4: { sp: 'lenz', nx: null },
  }),
  npc('lenz_l3', 'lenz', 2, [4], {
    n1: { sp: 'lenz', nx: 'n2' },
    n2: { sp: 'lenz', fx: [{ flag: 'truth_hint' }], o: [['n3'], ['n4']] },
    n3: { sp: 'lenz', nx: 'n4' },
    n4: { sp: 'lenz', nx: 'n5' },
    n5: { sp: 'lenz', o: [[null, [{ meta: 'lenz_promise' }]], [null]] },
  }, { setsStage: 3 }),
  npc('lenz_l4', 'lenz', 3, [4, 5], {
    n1: { sp: 'lenz', nx: 'n2' },
    n2: { sp: 'lenz', fx: [{ give: 'llave_coro' }, { arc: 'lenz', stage: 4 }, { meta: 'lenz_key' }], nx: 'n3' },
    n3: { sp: 'lenz', nx: null },
  }, { cond: { arcGte: ['bruno', 3] } }),
];

// ================================================================== Faro (radio)
const FARO: SceneDef[] = [
  S('faro_f1', 'radio', { npc: 'faro', stage: 0, zones: [1, 2], setsStage: 1 }, {
    n1: { sp: 'radio', nx: 'n2' },
    n2: { sp: 'faro', o: [['n3'], ['n3']] },
    n3: { sp: 'faro', nx: null },
  }),
  S('faro_f2', 'radio', { npc: 'faro', stage: 1, zones: [3] }, {
    n1: { sp: 'faro', o: [
      ['n2', [{ energy: -30 }, { meta: 'dock_power' }, { arc: 'faro', stage: 2 }], { energyGte: 30 }],
      ['n3', [{ trust: -5 }, { meta: 'dock_power' }, { arc: 'faro', stage: 2 }]],
      ['n4'],
    ] },
    n2: { sp: 'faro', nx: null },
    n3: { sp: 'agora', nx: 'n2' },
    n4: { sp: 'faro', nx: null },
  }),
  S('faro_f3', 'radio', { npc: 'faro', stage: 2, zones: [4], setsStage: 3 }, {
    n1: { sp: 'faro', fx: [{ meta: 'hull_code' }], nx: 'n2' },
    n2: { sp: 'faro', nx: null },
  }),
  npc('faro_f4', 'faro', 3, [6], {
    n1: { sp: 'narrator', nx: 'n2' },
    n2: { sp: 'faro', nx: 'n3' },
    n3: { sp: 'faro', fx: [{ flag: 'caronte_ready' }, { arc: 'faro', stage: 4 }, { meta: 'faro_met' }, { fate: 'faro', v: 'pilot' }], nx: 'n4' },
    n4: { sp: 'faro', nx: null },
  }, { floors: [4] }),
];

// ================================================================== Eventos morales
const ev = (id: string, zones: number[], nodes: Record<string, N>, extra: Partial<SceneDef> = {}): SceneDef => S(id, 'event', { zones, ...extra }, nodes);
const ALLZ = [1, 2, 3, 4, 5];

const EVENTS: SceneDef[] = [
  ev('E01', [1], {
    n1: { sp: 'narrator', o: [['n2', [{ energy: -30 }, { survivors: 1 }, { trust: 5 }, { meta: 'saved_sleeper', add: 1 }], { energyGte: 30 }], ['n3', [{ energy: 40 }, { trust: -10 }, { meta: 'killed_sleeper', add: 1 }]], [null]] },
    n2: { sp: 'agora', nx: null },
    n3: { sp: 'narrator', nx: 'n4' },
    n4: { sp: 'agora', nx: null },
  }),
  ev('E02', [1], {
    n1: { sp: 'agora', o: [['n2', [{ vent: true }, { trust: 6 }, { meta: 'vented_mess' }]], ['n3', [{ trust: -4 }]], ['n4', [{ log: 'R02' }, { noise: 4 }]]] },
    n2: { sp: 'agora', nx: null },
    n3: { sp: 'agora', nx: null },
    n4: { sp: 'narrator', o: [['n2', [{ vent: true }, { trust: 3 }, { meta: 'vented_mess' }]], ['n3']] },
  }),
  ev('E03', [1], {
    n1: { sp: 'narrator', o: [[null, [{ give: 'piezas', n: 3 }]], ['n2', [{ meta: 'toys_left' }]]] },
    n2: { sp: 'narrator', nx: null },
  }),
  ev('E04', [1], {
    n1: { sp: 'narrator', o: [['n2', [{ noise: 5 }, { scrap: 15 }]], ['n3', [{ trust: 3 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'agora', nx: null },
  }),
  ev('E05', [1], {
    n1: { sp: 'narrator', o: [[null, [{ heal: 8 }, { meta: 'rations_taken', add: 1 }]], ['n2', [{ meta: 'rations_left' }]]] },
    n2: { sp: 'agora', nx: null },
  }),
  ev('E06', [2], {
    n1: { sp: 'narrator', o: [['n2', [{ scrap: 5 }, { flag: 'killed_singer' }]], ['n3', [{ meta: 'singer_spared' }]], ['n3', [{ log: 'R16' }, { noise: 8 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E07', [2], {
    n1: { sp: 'narrator', o: [['n2', [{ flag: 'spores_reduced' }, { meta: 'seeds_burned' }, { give: 'semillas' }]], ['n3', [{ give: 'semillas' }, { meta: 'seeds_saved' }, { noise: 5 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E08', [2], {
    n1: { sp: 'narrator', o: [['n2', [{ noise: 3 }]], ['n3'], ['n4', [{ trust: 3 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
    n4: { sp: 'agora', nx: null },
  }),
  ev('E09', [2, 3], {
    n1: { sp: 'agora', o: [['n2', [{ implant: 'o_nocturna' }, { trust: 10 }, { noise: 10 }, { meta: 'agora_read' }]], ['n3', [{ trust: -3 }]]] },
    n2: { sp: 'agora', nx: null },
    n3: { sp: 'agora', nx: null },
  }),
  ev('E10', [2], {
    n1: { sp: 'narrator', o: [['n2', [{ give: 'muestra_micelio' }, { noise: 3 }, { flag: 'lenz_upset' }]], [null]] },
    n2: { sp: 'narrator', nx: null },
  }, { weight: 3, cond: { not: { has: 'muestra_micelio' } } }),
  ev('E11', [2], {
    n1: { sp: 'narrator', o: [['n2', [{ meta: 'water_garden' }, { flag: 'water_garden' }]], ['n3', [{ meta: 'water_reactor' }, { flag: 'water_reactor' }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E12', [3], {
    n1: { sp: 'tomas', o: [['n2', [{ take: 'bombona' }, { meta: 'tomas_helped' }, { flag: 'reactor_cooled' }], { has: 'bombona' }], ['n3']] },
    n2: { sp: 'tomas', nx: null },
    n3: { sp: 'tomas', nx: null },
  }, { cond: { arcGte: ['tomas', 1] } }),
  ev('E13', [3], {
    n1: { sp: 'narrator', o: [['n2', [{ allies: 2 }, { trust: -2 }]], ['n3', [{ give: 'piezas', n: 6 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E14', [3], {
    n1: { sp: 'narrator', nx: 'n2' },
    n2: { sp: 'agora', o: [['n3', [{ give: 'mensaje_samuel' }, { trust: -5 }, { meta: 'samuel_msg' }]], ['n4', [{ trust: 5 }]]] },
    n3: { sp: 'narrator', nx: null },
    n4: { sp: 'agora', nx: null },
  }),
  ev('E15', [3], {
    n1: { sp: 'narrator', o: [['n2', [{ killNear: 'all' }, { trust: -8 }, { flag: 'relay_overloaded' }]], [null]] },
    n2: { sp: 'agora', nx: null },
  }),
  ev('E16', [3], {
    n1: { sp: 'narrator', o: [['n2', [{ hp: -6 }, { give: 'dibujo_bruno' }, { meta: 'drawing_taken' }]], [null]] },
    n2: { sp: 'narrator', nx: null },
  }, { cond: { all: [{ arcGte: ['bruno', 1] }, { not: { has: 'dibujo_bruno' } }] } }),
  ev('E17', [3], {
    n1: { sp: 'agora', o: [['n2', [{ implant: 't_corazon' }, { trust: 12 }, { flag: 'tomas_locked' }]], ['n3', [{ trust: -4 }]]] },
    n2: { sp: 'agora', nx: null },
    n3: { sp: 'agora', nx: null },
  }),
  ev('E18', [4], {
    n1: { sp: 'narrator', o: [['n2', [{ noise: 8 }, { flag: 'subject31_released' }, { meta: 'subject31' }]], ['n3', [{ trust: 4 }]], [null]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E19', [4], {
    n1: { sp: 'narrator', fx: [{ flag: 'truth_hint' }], o: [['n2', [{ trust: -5 }]], ['n3', [{ give: 'firma_ferran' }, { meta: 'signature_kept' }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }, { weight: 2, cond: { not: { has: 'firma_ferran' } } }),
  ev('E20', [4], {
    n1: { sp: 'narrator', o: [['n2', [{ noise: 10 }, { flag: 'mirror_seen' }]], ['n3', [{ noise: -5 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E21', [4], {
    n1: { sp: 'narrator', o: [['n2', [{ noise: -100 }, { memorias: -10 }, { flag: 'erased_floor' }]], [null]] },
    n2: { sp: 'narrator', nx: null },
  }),
  ev('E22', [4, 5], {
    n1: { sp: 'narrator', nx: 'n2' },
    n2: { sp: 'agora', o: [['n3', [{ trust: -20 }, { meta: 'truth_sent' }, { noise: 6 }]], ['n4', [{ trust: 5 }]]] },
    n3: { sp: 'narrator', nx: null },
    n4: { sp: 'agora', nx: null },
  }),
  ev('E23', [5], {
    n1: { sp: 'narrator', o: [['n2', [{ survivors: 2 }, { meta: 'sleepers_woken' }]], ['n3']] },
    n2: { sp: 'agora', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E24', [5], {
    n1: { sp: 'narrator', o: [['n2', [{ meta: 'ruiz_obeyed' }, { flag: 'ruiz_obeyed' }]], ['n3']] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }),
  ev('E25', [5], {
    n1: { sp: 'agora', o: [['n2', [{ trust: -10 }, { log: 'R56' }]], ['n3', [{ trust: 10 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'agora', nx: null },
  }),
  ev('E26', [5], {
    n1: { sp: 'narrator', o: [['n2', [{ meta: 'dock_powered' }, { flag: 'dock_powered' }]], ['n3', [{ trust: 5 }]]] },
    n2: { sp: 'faro', nx: null },
    n3: { sp: 'agora', nx: null },
  }, { cond: { arcGte: ['faro', 2] } }),
  ev('E27', [5], {
    n1: { sp: 'agora', o: [['n2', [{ flag: 'lucia_asked' }, { meta: 'lucia_asked' }, { trust: 5 }]], ['n3']] },
    n2: { sp: 'agora', nx: null },
    n3: { sp: 'agora', nx: null },
  }, { cond: { trustGte: 60 } }),
  ev('E28', ALLZ, {
    n1: { sp: 'narrator', o: [['n2', [{ give: 'botiquin' }, { give: 'bateria' }]], ['n3', [{ memorias: 5 }, { trust: 2 }]]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }, { cond: { deathsGte: 3 } }),
  ev('E29', ALLZ, {
    n1: { sp: 'narrator', o: [['n2', [{ maxHp: -10 }, { implant: 'b_reflejos' }]], [null]] },
    n2: { sp: 'narrator', nx: null },
  }),
  ev('E30', [3, 4, 5], {
    n1: { sp: 'narrator', o: [['n2', [{ killNear: 'all' }, { o2: -30 }]], [null]] },
    n2: { sp: 'narrator', nx: null },
  }),
  ev('E31', ALLZ, {
    n1: { sp: 'narrator', o: [['n2', [{ trust: -3 }, { meta: 'message_home' }]], [null]] },
    n2: { sp: 'agora', nx: null },
  }),
  ev('E32', [4], {
    n1: { sp: 'coro', o: [['n2', [{ noise: -100 }, { log: 'R43' }, { meta: 'coro_deal' }]], ['n3', [{ trust: 3 }]]] },
    n2: { sp: 'coro', nx: 'n4' },
    n4: { sp: 'narrator', nx: null },
    n3: { sp: 'coro', nx: null },
  }),
  ev('E33', [2], {
    n1: { sp: 'narrator', o: [['n2', [{ give: 'caja_musica' }, { flag: 'demeter_angry' }]], ['n3', [{ give: 'caja_musica' }, { meta: 'hana_gave' }], { arcGte: ['bruno', 2] }]] },
    n2: { sp: 'narrator', nx: null },
    n3: { sp: 'narrator', nx: null },
  }, { weight: 4, cond: { all: [{ arcEq: ['bruno', 2] }, { not: { has: 'caja_musica' } }] } }),
  ev('E34', [6], {
    n1: { sp: 'narrator', o: [['n2', [{ meta: 'rope_cut' }, { noise: -10 }]], [null]] },
    n2: { sp: 'narrator', nx: null },
  }),
];

// ================================================================== Núcleo: elección de final
const confirm = (end: string): Record<string, N> => ({
  [`c_${end}`]: { sp: 'agora', o: [[null, [{ ending: end }]], ['n1']] },
});

const ENDING: SceneDef[] = [
  S('core', 'ending', { zones: [5] }, {
    n1: { sp: 'agora', o: [
      ['c_redencion', [], { flag: 'truth_known' }],
      ['c_custodia', [], { trustGte: 60 }],
      ['c_evacuacion', [], { any: [{ flag: 'pods_ready' }, { flag: 'caronte_ready' }] }],
      ['c_liberacion', [], { all: [{ has: 'llave_coro' }, { arcGte: ['bruno', 4] }] }],
      ['c_olvido', []],
      ['c_verdadero', [], { all: [{ logsGte: 66 }, { meta: 'olvido_seen' }, { trustGte: 50 }, { has: 'llave_coro' }, { arcGte: ['bruno', 4] }, { arcGte: ['solis', 3] }, { meta: 'hull_done' }, { flag: 'caronte_ready' }] }],
    ] },
    ...confirm('redencion'), ...confirm('custodia'), ...confirm('evacuacion'), ...confirm('liberacion'), ...confirm('olvido'), ...confirm('verdadero'),
  }),
  // presentaciones de jefe y momentos clave
  S('cocito_reveal', 'agora', { zones: [4] }, {
    n1: { sp: 'ferran', nx: 'n2' },
    n2: { sp: 'ferran', nx: 'n3' },
    n3: { sp: 'agora', nx: null },
  }),
  S('hull_entry', 'agora', { zones: [4, 6] }, {
    n1: { sp: 'faro', o: [[null, [{ flag: 'go_hull' }]], [null]] },
  }),
];

// en el Núcleo, los finales no disponibles se muestran atenuados para que se sepa que existen
for (const o of ENDING[0].nodes.n1.options ?? []) if (o.cond) o.hideIfLocked = false;

export const SCENES: SceneDef[] = [...CELIA, ...TOMAS, ...BRUNO, ...SOLIS, ...LENZ, ...FARO, ...EVENTS, ...ENDING];
const BY_ID = new Map(SCENES.map((s) => [s.id, s]));
export function sceneDef(id: string): SceneDef | undefined {
  return BY_ID.get(id);
}
export const MORAL_EVENT_IDS = EVENTS.map((e) => e.id);
