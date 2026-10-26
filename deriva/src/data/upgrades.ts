import type { UpgradeDef } from '../core/content';

/** Árbol de 54 nodos. `req` admite ids de nodo y condiciones "flag:x" o "arc:npc:n". */
export const UPGRADES: UpgradeDef[] = [
  // Supervivencia
  { id: 'sv1', branch: 'supervivencia', cost: 15, req: [], mods: { maxO2: 10 }, pos: [0, 0] },
  { id: 'sv2', branch: 'supervivencia', cost: 20, req: ['sv1'], mods: { maxHp: 4 }, pos: [0, 1] },
  { id: 'sv3', branch: 'supervivencia', cost: 25, req: ['sv1'], start: [{ item: 'botiquin' }], pos: [1, 1] },
  { id: 'sv4', branch: 'supervivencia', cost: 35, req: ['sv2'], mods: { o2Mult: 0.92 }, pos: [0, 2] },
  { id: 'sv5', branch: 'supervivencia', cost: 30, req: ['sv3'], start: [{ item: 'bombona' }], pos: [1, 2] },
  { id: 'sv6', branch: 'supervivencia', cost: 50, req: ['sv4'], mods: { maxHp: 6 }, pos: [0, 3] },
  { id: 'sv7', branch: 'supervivencia', cost: 60, req: ['sv6'], mods: { regen: 30 }, pos: [0, 4] },
  { id: 'sv8', branch: 'supervivencia', cost: 60, req: ['sv3'], unlockClass: 'medico', pos: [1, 3] },
  { id: 'sv9', branch: 'supervivencia', cost: 90, req: ['sv7'], flag: 'last_breath', pos: [0, 5] },
  // Técnica
  { id: 'tc1', branch: 'tecnica', cost: 15, req: [], mods: { maxEnergy: 10 }, pos: [0, 0] },
  { id: 'tc2', branch: 'tecnica', cost: 20, req: ['tc1'], mods: { light: 2 }, pos: [0, 1] },
  { id: 'tc3', branch: 'tecnica', cost: 20, req: ['tc1'], start: [{ item: 'piezas', n: 3 }], pos: [1, 1] },
  { id: 'tc4', branch: 'tecnica', cost: 60, req: ['tc2'], unlockClass: 'soldador', pos: [0, 2] },
  { id: 'tc5', branch: 'tecnica', cost: 40, req: ['tc2'], mods: { energyMult: 0.9 }, pos: [0, 3] },
  { id: 'tc6', branch: 'tecnica', cost: 55, req: ['tc3'], flag: 'craft_anywhere', pos: [1, 2] },
  { id: 'tc7', branch: 'tecnica', cost: 45, req: ['tc6'], flag: 'recipes_adv', pos: [1, 3] },
  { id: 'tc8', branch: 'tecnica', cost: 50, req: ['tc5'], start: [{ item: 'bateria_g' }], pos: [0, 4] },
  { id: 'tc9', branch: 'tecnica', cost: 80, req: ['tc8'], mods: { armor: 1 }, pos: [0, 5] },
  // Sigilo
  { id: 'sg1', branch: 'sigilo', cost: 15, req: [], mods: { noiseMult: 0.9 }, pos: [0, 0] },
  { id: 'sg2', branch: 'sigilo', cost: 20, req: ['sg1'], mods: { sight: 1 }, pos: [1, 1] },
  { id: 'sg3', branch: 'sigilo', cost: 40, req: ['sg1'], unlockClass: 'infiltrado', pos: [0, 1] },
  { id: 'sg4', branch: 'sigilo', cost: 35, req: ['sg3'], mods: { stealthKill: 1.25 }, pos: [0, 2] },
  { id: 'sg5', branch: 'sigilo', cost: 25, req: ['sg3'], start: [{ item: 'baliza', n: 2 }], pos: [0, 3] },
  { id: 'sg6', branch: 'sigilo', cost: 60, req: ['sg2'], unlockClass: 'hacker', pos: [1, 2] },
  { id: 'sg7', branch: 'sigilo', cost: 40, req: ['sg6'], mods: { hack: 1 }, pos: [1, 3] },
  { id: 'sg8', branch: 'sigilo', cost: 55, req: ['sg4'], mods: { noiseMult: 0.85 }, pos: [0, 4] },
  { id: 'sg9', branch: 'sigilo', cost: 45, req: ['sg8'], flag: 'silent_doors', pos: [0, 5] },
  // Memoria
  { id: 'mm1', branch: 'memoria', cost: 15, req: [], trust: 5, pos: [0, 0] },
  { id: 'mm2', branch: 'memoria', cost: 25, req: ['mm1'], flag: 'log_radar', pos: [0, 1] },
  { id: 'mm3', branch: 'memoria', cost: 20, req: ['mm1'], scrap: 20, pos: [1, 1] },
  { id: 'mm4', branch: 'memoria', cost: 35, req: ['mm2'], trust: 5, pos: [0, 2] },
  { id: 'mm5', branch: 'memoria', cost: 30, req: ['mm3'], flag: 'clone_notes', pos: [1, 2] },
  { id: 'mm6', branch: 'memoria', cost: 40, req: ['mm4'], flag: 'pre_identify', pos: [0, 3] },
  { id: 'mm7', branch: 'memoria', cost: 45, req: ['mm5'], mods: { acc: 5 }, pos: [1, 3] },
  { id: 'mm8', branch: 'memoria', cost: 40, req: ['mm4'], orbit: 600, pos: [0, 4] },
  { id: 'mm9', branch: 'memoria', cost: 70, req: ['mm8'], flag: 'agora_extra', trust: 5, pos: [0, 5] },
  // Acceso
  { id: 'ac1', branch: 'acceso', cost: 30, req: [], flag: 'service_map', pos: [0, 0] },
  { id: 'ac2', branch: 'acceso', cost: 60, req: ['ac1', 'flag:boss_hipnos'], startZone: 2, pos: [0, 1] },
  { id: 'ac3', branch: 'acceso', cost: 90, req: ['ac2', 'flag:boss_demeter'], startZone: 3, pos: [0, 2] },
  { id: 'ac4', branch: 'acceso', cost: 120, req: ['ac3', 'flag:boss_flegetonte'], startZone: 4, pos: [0, 3] },
  { id: 'ac5', branch: 'acceso', cost: 150, req: ['ac4', 'flag:boss_cocito'], startZone: 5, pos: [0, 4] },
  { id: 'ac6', branch: 'acceso', cost: 60, req: ['ac1', 'arc:faro:3'], start: [{ item: 'traje_eva' }], pos: [1, 1] },
  { id: 'ac7', branch: 'acceso', cost: 50, req: ['ac1'], flag: 'service_key', pos: [1, 2] },
  { id: 'ac8', branch: 'acceso', cost: 55, req: ['ac7'], flag: 'zone_cache', pos: [1, 3] },
  { id: 'ac9', branch: 'acceso', cost: 70, req: ['ac8'], orbit: 900, pos: [1, 4] },
  // Laboratorio
  { id: 'lb1', branch: 'laboratorio', cost: 25, req: [], start: [{ item: 'kit_implante' }], pos: [0, 0] },
  { id: 'lb2', branch: 'laboratorio', cost: 35, req: ['lb1'], unlockImplants: ['b_reflejos', 'b_tactico', 'b_overclock'], pos: [0, 1] },
  { id: 'lb3', branch: 'laboratorio', cost: 35, req: ['lb1'], unlockImplants: ['o_analitico', 'o_escaner', 'o_termica'], pos: [1, 1] },
  { id: 'lb4', branch: 'laboratorio', cost: 45, req: ['lb2'], unlockImplants: ['t_regenerador', 't_escudo', 't_autodoc', 't_camuflaje'], pos: [0, 2] },
  { id: 'lb5', branch: 'laboratorio', cost: 45, req: ['lb3'], unlockImplants: ['a_hidraulico', 'a_cuchilla', 'p_resorte', 'p_saltador'], pos: [1, 2] },
  { id: 'lb6', branch: 'laboratorio', cost: 60, req: ['lb4'], flag: 'start_implant', pos: [0, 3] },
  { id: 'lb7', branch: 'laboratorio', cost: 80, req: ['lb5'], unlockImplants: ['b_eco', 'o_espectro', 't_simbionte', 'a_lete', 'p_lete', 'b_lete_voz'], pos: [1, 3] },
  { id: 'lb8', branch: 'laboratorio', cost: 40, req: ['lb7'], mods: { mentalMult: 0.85 }, pos: [1, 4] },
  { id: 'lb9', branch: 'laboratorio', cost: 50, req: ['lb6'], flag: 'surgeon_free', pos: [0, 4] },
];

export function upgradeDef(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

/** Implantes bloqueados tras algún catálogo. */
export const LOCKED_IMPLANTS = new Set(UPGRADES.flatMap((u) => u.unlockImplants ?? []));
