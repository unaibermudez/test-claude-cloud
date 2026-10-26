import type { ClassDef } from '../core/content';

export const CLASSES: ClassDef[] = [
  {
    id: 'tecnico', hp: 30, o2: 100, energy: 60, mods: { o2Mult: 0.9 },
    start: [{ item: 'llave_inglesa' }, { item: 'clavadora' }, { item: 'sellador' }, { item: 'bombona' }, { item: 'vendas', n: 2 }],
    ammo: { clavos: 24 }, unlock: null, suit: ['#0b0d12', '#d08a3a', '#7a4e20', '#ffd08a'],
  },
  {
    id: 'infiltrado', hp: 24, o2: 100, energy: 60, mods: { noiseMult: 0.75, stealthKill: 1.3, evasion: 8 },
    start: [{ item: 'cuchillo' }, { item: 'pistola_dardos' }, { item: 'baliza', n: 2 }, { item: 'vendas', n: 2 }],
    ammo: { virotes: 12 }, implants: ['p_silencio'], unlock: 'sg3', suit: ['#06080a', '#3a4a52', '#222c32', '#7a9aa8'],
  },
  {
    id: 'medico', hp: 28, o2: 100, energy: 60, mods: { healMult: 1.5, mentalMult: 0.9 },
    start: [{ item: 'bisturi' }, { item: 'pistola' }, { item: 'botiquin', n: 2 }, { item: 'vendas', n: 2 }, { item: 'sedante' }],
    ammo: { balas: 14 }, unlock: 'sv8', suit: ['#0c0c10', '#d8dae0', '#9a3a3a', '#ffffff'],
  },
  {
    id: 'soldador', hp: 38, o2: 110, energy: 80, mods: { armor: 1, noiseMult: 1.2, melee: 1 },
    start: [{ item: 'hacha' }, { item: 'soldador' }, { item: 'incendiaria' }, { item: 'bateria' }],
    ammo: {}, unlock: 'tc4', suit: ['#100804', '#8a5a2a', '#4a2e14', '#e0a060'],
  },
  {
    id: 'hacker', hp: 24, o2: 100, energy: 90, mods: { hack: 2, energyMult: 0.9 },
    start: [{ item: 'porra' }, { item: 'arco_voltaico' }, { item: 'granada_pem', n: 2 }, { item: 'dron' }],
    ammo: {}, implants: ['b_coprocesador'], unlock: 'sg6', suit: ['#060a0c', '#2a6a7a', '#163a44', '#7af0ff'],
  },
  {
    id: 'eco', hp: 30, o2: 100, energy: 70, mods: { mentalMult: 0.5, sense: 5, evasion: 5 },
    start: [{ item: 'daga_lete' }, { item: 'sedante', n: 2 }, { item: 'vendas', n: 2 }],
    ammo: {}, implants: ['b_lete_voz'], unlock: 'flag:ending_liberacion', suit: ['#0c0814', '#9a7ac8', '#5a4680', '#f0e0ff'],
  },
];

export function classDef(id: string): ClassDef {
  return CLASSES.find((c) => c.id === id) ?? CLASSES[0];
}
