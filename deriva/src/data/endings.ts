import type { EndingDef } from '../core/content';

export const ENDINGS: EndingDef[] = [
  { id: 'redencion', kind: 'main', cond: { flag: 'truth_known', gte: 1 }, music: 'end_redencion', memorias: 40 },
  { id: 'custodia', kind: 'main', cond: { trustGte: 60 }, music: 'end_custodia', memorias: 40 },
  { id: 'evacuacion', kind: 'main', cond: { any: [{ flag: 'pods_ready', gte: 1 }, { flag: 'caronte_ready', gte: 1 }] }, music: 'end_evacuacion', memorias: 40 },
  { id: 'liberacion', kind: 'main', cond: { all: [{ has: 'llave_coro' }, { arcGte: ['bruno', 4] }] }, music: 'end_liberacion', memorias: 40 },
  { id: 'olvido', kind: 'main', music: 'end_olvido', memorias: 30 },
  {
    id: 'verdadero', kind: 'true', music: 'end_verdadero', memorias: 100,
    cond: {
      all: [
        { logsGte: 66 }, { meta: 'olvido_seen', gte: 1 }, { trustGte: 50 }, { has: 'llave_coro' },
        { arcGte: ['bruno', 4] }, { arcGte: ['solis', 3] }, { meta: 'hull_done', gte: 1 }, { flag: 'caronte_ready', gte: 1 },
      ],
    },
  },
  { id: 'caida', kind: 'death', music: 'end_death', memorias: 10 },
  { id: 'respiracion', kind: 'death', music: 'end_death', memorias: 10 },
  { id: 'disolucion', kind: 'death', music: 'end_death', memorias: 10 },
  { id: 'sentencia', kind: 'death', music: 'end_death', memorias: 10 },
  { id: 'deriva', kind: 'death', music: 'end_death', memorias: 10 },
];

export const MAIN_ENDINGS = ENDINGS.filter((e) => e.kind !== 'death').map((e) => e.id);
export const DEATH_ENDINGS = ENDINGS.filter((e) => e.kind === 'death').map((e) => e.id);
