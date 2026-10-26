import type { ItemDef, WeaponDef, ImplantDef, Mods, ImplantSlot } from '../core/content';

const W = (id: string, tier: number, price: number, icon: string, color: string, weapon: WeaponDef, weight = 1): ItemDef =>
  ({ id, type: 'weapon', tier, price, icon, color, weapon, weight });

// ------------------------------------------------------------------ armas (29)
export const WEAPONS: ItemDef[] = [
  // cuerpo a cuerpo
  W('llave_inglesa', 1, 20, 'wrench', '#b8c0cc', { kind: 'melee', dmg: [2, 4], acc: 85, range: 1, noise: 4, traits: [] }, 0.6),
  W('tuberia', 1, 25, 'pipe', '#8d949e', { kind: 'melee', dmg: [3, 5], acc: 75, range: 1, noise: 5, traits: ['knockback'] }),
  W('cuchillo', 1, 25, 'knife', '#d8dde4', { kind: 'melee', dmg: [1, 3], acc: 92, range: 1, noise: 2, traits: ['silent', 'bleed', 'fast'], cost: 70 }),
  W('bisturi', 2, 45, 'scalpel', '#9fe8ff', { kind: 'melee', dmg: [2, 4], acc: 95, range: 1, noise: 1, traits: ['silent', 'bleed', 'fast'], cost: 70 }),
  W('hacha', 1, 40, 'axe', '#d0533e', { kind: 'melee', dmg: [4, 7], acc: 72, range: 1, noise: 6, traits: ['heavy'], cost: 120 }),
  W('porra', 1, 40, 'baton', '#f2d45c', { kind: 'melee', dmg: [2, 3], acc: 86, range: 1, noise: 3, traits: ['stun'], ammo: 'energy', ammoPer: 2 }),
  W('machete', 2, 45, 'machete', '#9ec26a', { kind: 'melee', dmg: [3, 6], acc: 80, range: 1, noise: 4, traits: ['bleed'] }),
  W('lanza', 2, 55, 'spear', '#c9b38a', { kind: 'melee', dmg: [3, 5], acc: 80, range: 2, noise: 4, traits: ['reach'] }),
  W('cizalla', 3, 80, 'shears', '#e0913a', { kind: 'melee', dmg: [5, 8], acc: 72, range: 1, noise: 6, traits: ['crush', 'heavy'], cost: 115 }),
  W('martillo', 3, 90, 'hammer', '#c46a2f', { kind: 'melee', dmg: [6, 10], acc: 66, range: 1, noise: 10, traits: ['knockback', 'heavy', 'loud'], cost: 125 }),
  W('guante', 3, 95, 'glove', '#7ab6ff', { kind: 'melee', dmg: [3, 5], acc: 86, range: 1, noise: 5, traits: ['knockback', 'stun'], ammo: 'energy', ammoPer: 3 }),
  W('cortador', 4, 130, 'cutter', '#ff7a3c', { kind: 'melee', dmg: [6, 9], acc: 86, range: 1, noise: 5, traits: ['fire', 'breach'], ammo: 'energy', ammoPer: 4 }),
  W('sierra', 4, 120, 'saw', '#d8385a', { kind: 'melee', dmg: [5, 8], acc: 80, range: 1, noise: 7, traits: ['bleed', 'lifesteal'] }),
  W('daga_lete', 4, 140, 'dagger', '#c48cff', { kind: 'melee', dmg: [4, 7], acc: 92, range: 1, noise: 1, traits: ['mental', 'silent', 'fast'], cost: 80 }),
  // a distancia
  W('pistola', 1, 50, 'pistol', '#a7b0bd', { kind: 'ranged', dmg: [3, 5], acc: 80, range: 7, ammo: 'balas', ammoPer: 1, noise: 9, traits: [] }),
  W('pistola_dardos', 1, 50, 'dartgun', '#7fd1a8', { kind: 'ranged', dmg: [1, 3], acc: 86, range: 6, ammo: 'virotes', ammoPer: 1, noise: 2, traits: ['silent', 'stun'] }),
  W('clavadora', 1, 40, 'nailgun', '#e8c46a', { kind: 'ranged', dmg: [2, 4], acc: 76, range: 5, ammo: 'clavos', ammoPer: 1, noise: 5, traits: ['pierce'] }),
  W('bengalas', 2, 60, 'flaregun', '#ff8f4a', { kind: 'ranged', dmg: [3, 5], acc: 72, range: 6, ammo: 'cartuchos', ammoPer: 1, noise: 6, traits: ['fire', 'light'] }),
  W('escopeta', 2, 85, 'shotgun', '#b07a52', { kind: 'ranged', dmg: [4, 8], acc: 78, range: 3, ammo: 'cartuchos', ammoPer: 1, noise: 12, traits: ['knockback', 'cone', 'loud'] }),
  W('arpon', 2, 70, 'harpoon', '#6fb7c9', { kind: 'ranged', dmg: [4, 6], acc: 80, range: 6, ammo: 'virotes', ammoPer: 1, noise: 4, traits: ['harpoon'] }),
  W('remachadora', 3, 100, 'rivet', '#d9a441', { kind: 'ranged', dmg: [5, 8], acc: 86, range: 9, ammo: 'clavos', ammoPer: 2, noise: 7, traits: ['pierce'] }),
  W('subfusil', 3, 110, 'smg', '#8a96a8', { kind: 'ranged', dmg: [6, 10], acc: 72, range: 6, ammo: 'balas', ammoPer: 3, noise: 13, traits: ['loud'] }),
  W('arco_voltaico', 2, 90, 'arcgun', '#7af0ff', { kind: 'ranged', dmg: [3, 6], acc: 86, range: 5, ammo: 'energy', ammoPer: 5, noise: 6, traits: ['chain', 'emp'] }),
  W('soldador', 2, 80, 'welder', '#ffb347', { kind: 'ranged', dmg: [4, 7], acc: 90, range: 3, ammo: 'energy', ammoPer: 4, noise: 6, traits: ['fire', 'cone'] }),
  W('crio', 3, 105, 'cryo', '#9fe8ff', { kind: 'ranged', dmg: [3, 5], acc: 88, range: 4, ammo: 'energy', ammoPer: 5, noise: 5, traits: ['freeze', 'cone'] }),
  W('pulsos', 3, 120, 'pulse', '#7ab6ff', { kind: 'ranged', dmg: [5, 9], acc: 86, range: 9, ammo: 'energy', ammoPer: 6, noise: 7, traits: [] }),
  W('sonico', 3, 110, 'sonic', '#f2d45c', { kind: 'ranged', dmg: [2, 4], acc: 95, range: 4, ammo: 'energy', ammoPer: 5, noise: 8, traits: ['stun', 'aoe'], aoe: 1 }),
  W('lanza_termica', 4, 160, 'thermal', '#ff5a2a', { kind: 'ranged', dmg: [8, 12], acc: 82, range: 6, ammo: 'energy', ammoPer: 10, noise: 10, traits: ['fire', 'pierce', 'loud'] }),
  W('fusil_lete', 4, 170, 'lete', '#c48cff', { kind: 'ranged', dmg: [6, 10], acc: 90, range: 8, ammo: 'energy', ammoPer: 6, noise: 3, traits: ['mental'] }),
];

// ------------------------------------------------------------------ consumibles
const C = (id: string, tier: number, price: number, icon: string, color: string, consumable: ItemDef['consumable'], extra: Partial<ItemDef> = {}): ItemDef =>
  ({ id, type: 'consumable', tier, price, icon, color, consumable, stack: 9, weight: 1, ...extra });

export const CONSUMABLES: ItemDef[] = [
  C('botiquin', 1, 28, 'medkit', '#e85a5a', { heal: 12, cleanse: true }, { weight: 1.4 }),
  C('vendas', 1, 12, 'bandage', '#f0e6d2', { heal: 5, cleanse: true }, { weight: 1.6 }),
  C('medigel', 3, 55, 'medgel', '#ff7aa8', { heal: 25, cleanse: true }, { weight: 0.6 }),
  C('raciones', 1, 8, 'ration', '#c9a46b', { heal: 4 }, { weight: 1.2 }),
  C('bombona', 1, 22, 'o2', '#7fc4e0', { o2: 35 }, { weight: 1.8 }),
  C('bombona_g', 2, 45, 'o2big', '#4fa8d8', { o2: 70 }, { weight: 0.7 }),
  C('bateria', 1, 22, 'battery', '#f2d45c', { energy: 30 }, { weight: 1.5 }),
  C('bateria_g', 3, 48, 'cell', '#ffe27a', { energy: 60 }, { weight: 0.6 }),
  C('sedante', 1, 25, 'pill', '#b9a6ff', { noise: -25 }, { weight: 1.0 }),
  C('antirad', 2, 20, 'pill2', '#9be36b', { status: { id: 'radshield', turns: 60 } }, { weight: 0.8 }),
  C('estimulante', 2, 35, 'stim', '#ff9d40', { status: { id: 'haste', turns: 10 } }, { weight: 0.6 }),
  // inyectores desconocidos (apariencia aleatoria por partida)
  C('iny_regen', 1, 30, 'injector', '#ffffff', { status: { id: 'regen', turns: 15 } }, { unknown: 'injector', weight: 0.5 }),
  C('iny_adrenalina', 1, 30, 'injector', '#ffffff', { status: { id: 'haste', turns: 12 } }, { unknown: 'injector', weight: 0.5 }),
  C('iny_claridad', 1, 30, 'injector', '#ffffff', { noise: -40 }, { unknown: 'injector', weight: 0.5 }),
  C('iny_vision', 1, 30, 'injector', '#ffffff', { reveal: true }, { unknown: 'injector', weight: 0.5 }),
  C('iny_toxina', 1, 10, 'injector', '#ffffff', { damage: 6, status: { id: 'poison', turns: 6 } }, { unknown: 'injector', weight: 0.4 }),
  C('iny_mutageno', 2, 45, 'injector', '#ffffff', { maxHp: 4, noise: 10 }, { unknown: 'injector', weight: 0.3 }),
  C('iny_lete', 2, 40, 'injector', '#ffffff', { noise: 25, identifyAll: true }, { unknown: 'injector', weight: 0.35 }),
  C('iny_coagulante', 1, 25, 'injector', '#ffffff', { heal: 8, cleanse: true }, { unknown: 'injector', weight: 0.5 }),
  C('iny_furia', 2, 30, 'injector', '#ffffff', { status: { id: 'rage', turns: 10 } }, { unknown: 'injector', weight: 0.4 }),
];

// ------------------------------------------------------------------ gadgets
const G = (id: string, tier: number, price: number, icon: string, color: string, gadget: ItemDef['gadget'], weight = 1): ItemDef =>
  ({ id, type: 'gadget', tier, price, icon, color, gadget, stack: 5, weight });

export const GADGETS: ItemDef[] = [
  G('granada', 1, 40, 'grenade', '#9aa05a', { kind: 'grenade', radius: 2, dmg: [6, 10], range: 6 }),
  G('granada_pem', 1, 40, 'emp', '#7af0ff', { kind: 'emp', radius: 2, dmg: [4, 6], range: 6, traits: ['emp'] }),
  G('incendiaria', 2, 45, 'fire', '#ff7a3c', { kind: 'grenade', radius: 1, dmg: [3, 5], range: 6, traits: ['fire'] }),
  G('sellador', 1, 30, 'sealer', '#e8e2c8', { kind: 'sealer', range: 1 }, 1.2),
  G('baliza', 1, 20, 'beacon', '#ffd166', { kind: 'beacon', range: 7 }),
  G('dron', 2, 70, 'drone', '#8fd3ff', { kind: 'drone', range: 1 }, 0.5),
  G('bengala', 1, 12, 'flare', '#ff5a5a', { kind: 'flare', range: 7 }, 1.2),
  G('mina', 2, 45, 'mine', '#d94f4f', { kind: 'mine', radius: 1, dmg: [8, 12], range: 1 }, 0.7),
  G('carga', 2, 40, 'charge', '#ffb347', { kind: 'charge', range: 1, dmg: [10, 14], radius: 1 }, 0.7),
  G('espuma', 2, 35, 'foam', '#e0f0f0', { kind: 'foam', radius: 1, range: 6 }, 0.8),
  G('senuelo', 3, 50, 'decoy', '#c48cff', { kind: 'decoy', range: 5 }, 0.5),
];

// ------------------------------------------------------------------ munición y otros
export const MISC: ItemDef[] = [
  { id: 'mun_balas', type: 'ammo', tier: 1, price: 15, icon: 'ammo', color: '#c9b38a', ammo: { type: 'balas', amount: 8 }, weight: 1.4 },
  { id: 'mun_cartuchos', type: 'ammo', tier: 1, price: 15, icon: 'shells', color: '#d0533e', ammo: { type: 'cartuchos', amount: 4 }, weight: 1.1 },
  { id: 'mun_clavos', type: 'ammo', tier: 1, price: 12, icon: 'nails', color: '#b8c0cc', ammo: { type: 'clavos', amount: 12 }, weight: 1.4 },
  { id: 'mun_virotes', type: 'ammo', tier: 1, price: 15, icon: 'bolts', color: '#7fd1a8', ammo: { type: 'virotes', amount: 5 }, weight: 1.1 },
  { id: 'piezas', type: 'part', tier: 1, price: 10, icon: 'parts', color: '#9aa3ad', stack: 20, weight: 1.6 },
  { id: 'kit_implante', type: 'kit', tier: 1, price: 45, icon: 'kit', color: '#7ab6ff', stack: 5, weight: 0.4 },
  { id: 'kit_reparacion', type: 'kit', tier: 1, price: 35, icon: 'repair', color: '#e8c46a', stack: 5, weight: 0.4 },
  { id: 'traje_eva', type: 'suit', tier: 0, price: 0, icon: 'suit', color: '#ffb46e' },
  // objetos de misión
  { id: 'muestra_micelio', type: 'quest', tier: 0, price: 0, icon: 'sample', color: '#a6d96a' },
  { id: 'caja_musica', type: 'quest', tier: 0, price: 0, icon: 'musicbox', color: '#e8c46a' },
  { id: 'anillo_samuel', type: 'quest', tier: 0, price: 0, icon: 'ring', color: '#ffd166' },
  { id: 'llave_coro', type: 'quest', tier: 0, price: 0, icon: 'key_coro', color: '#c48cff' },
  { id: 'dibujo_bruno', type: 'quest', tier: 0, price: 0, icon: 'drawing', color: '#ffb0c8' },
  { id: 'firma_ferran', type: 'quest', tier: 0, price: 0, icon: 'document', color: '#f0e6d2' },
  { id: 'semillas', type: 'quest', tier: 0, price: 0, icon: 'seeds', color: '#9be36b' },
  { id: 'mensaje_samuel', type: 'quest', tier: 0, price: 0, icon: 'datapad', color: '#7fc4e0' },
  { id: 'fragmento_final', type: 'quest', tier: 0, price: 0, icon: 'fragment', color: '#ffffff' },
];

// ------------------------------------------------------------------ implantes (46)
const I = (id: string, slot: ImplantSlot, rarity: 1 | 2 | 3, mods: Mods, extra: Partial<ImplantDef> = {}, price?: number): ItemDef => ({
  id, type: 'implant', tier: rarity === 1 ? 1 : rarity === 2 ? 2 : 3, price: price ?? (rarity === 1 ? 60 : rarity === 2 ? 95 : 140),
  icon: `imp_${slot}`, color: extra.lete ? '#c48cff' : slot === 'brain' ? '#ff9db5' : slot === 'eyes' ? '#7af0ff' : slot === 'torso' ? '#e8c46a' : slot === 'arms' ? '#ffb347' : '#9be36b',
  implant: { slot, mods, rarity, ...extra }, unknown: rarity >= 2 ? 'module' : undefined, weight: rarity === 1 ? 1 : rarity === 2 ? 0.6 : 0.3,
});

export const IMPLANTS: ItemDef[] = [
  // cerebro
  I('b_coprocesador', 'brain', 1, { hack: 2, acc: 5, mentalMult: 1.2 }),
  I('b_calma', 'brain', 1, { mentalMult: 0.6, acc: -5 }),
  I('b_eco', 'brain', 2, { sense: 6, noisePerTurn: 0.03 }, { lete: true }),
  I('b_memoria', 'brain', 2, { scrapMult: 1.25, seeHidden: true, maxEnergy: -10 }),
  I('b_reflejos', 'brain', 2, { evasion: 10, crit: 5, migraine: 0.01 }),
  I('b_lete_voz', 'brain', 3, { noisePerTurn: 0.05 }, { lete: true, active: 'pulse', activeCost: 12 }),
  I('b_ancla', 'brain', 2, { mentalMult: 0.4, hack: -1, sight: -1 }),
  I('b_tactico', 'brain', 2, { ranged: 2, acc: 8, energyMult: 1.15 }),
  I('b_sigilo', 'brain', 1, { noiseMult: 0.7, maxHp: -4 }),
  I('b_overclock', 'brain', 3, { mentalMult: 1.15 }, { active: 'overclock', activeCost: 15 }),
  // ojos
  I('o_nocturna', 'eyes', 1, { nightVision: true, migraine: 0.006 }),
  I('o_termica', 'eyes', 2, { thermal: true, sight: -1 }),
  I('o_zoom', 'eyes', 1, { sight: 3, acc: 8, evasion: -5 }),
  I('o_analitico', 'eyes', 2, { seeHidden: true, crit: 8, energyMult: 1.1 }),
  I('o_espectro', 'eyes', 3, { noisePerTurn: 0.02, mentalMult: 0.9 }, { lete: true }),
  I('o_flash', 'eyes', 1, { light: 2, sight: 1 }),
  I('o_rastreador', 'eyes', 2, { sense: 4, noiseMult: 1.1 }),
  I('o_escaner', 'eyes', 2, {}, { active: 'scan', activeCost: 10 }),
  // torso
  I('t_pulmon', 'torso', 1, { maxO2: 40, noiseMult: 1.15 }),
  I('t_blindaje', 'torso', 1, { armor: 2, moveCost: 10, evasion: -5 }),
  I('t_reciclador', 'torso', 2, { o2Mult: 0.75, maxHp: -3 }),
  I('t_bateria', 'torso', 1, { maxEnergy: 30, armor: -1 }),
  I('t_regenerador', 'torso', 2, { regen: 12, energyMult: 1.2 }),
  I('t_corazon', 'torso', 3, { maxEnergy: 40, energyRegen: 0.1, radResist: 0.5, noiseMult: 1.2 }, {}, 0),
  I('t_escudo', 'torso', 2, { shield: 2, energyMult: 1.1 }),
  I('t_vacio', 'torso', 2, { vacuum: 0.5, healMult: 0.8 }),
  I('t_simbionte', 'torso', 3, { regen: 6, noisePerTurn: 0.04, mentalMult: 1.3 }, { lete: true }),
  I('t_camuflaje', 'torso', 3, { maxO2: -15 }, { active: 'cloak', activeCost: 20 }),
  I('t_autodoc', 'torso', 2, { energyMult: 1.1 }, { active: 'heal', activeCost: 20 }),
  // brazos
  I('a_servo', 'arms', 1, { melee: 2, pushPower: 1, acc: -5 }),
  I('a_estabilizador', 'arms', 1, { acc: 10, melee: -1 }),
  I('a_cuchilla', 'arms', 2, { stealthKill: 1.5, melee: 1, energyMult: 1.05 }),
  I('a_ganzua', 'arms', 1, { hack: 1, scrapMult: 1.1, melee: -1 }),
  I('a_hidraulico', 'arms', 2, { melee: 4, pushPower: 2, moveCost: 10, noiseMult: 1.15 }),
  I('a_conducto', 'arms', 2, { melee: 1, energyMult: 1.1 }),
  I('a_lete', 'arms', 3, { noisePerTurn: 0.03, melee: 1 }, { lete: true }),
  I('a_lanzador', 'arms', 2, { ranged: 2, acc: 4, maxHp: -2 }),
  // piernas
  I('p_silencio', 'legs', 1, { noiseMult: 0.6, moveCost: 10 }),
  I('p_magneticas', 'legs', 2, { magboots: true, noiseMult: 1.1 }),
  I('p_resorte', 'legs', 2, { moveCost: -20, noiseMult: 1.25 }),
  I('p_estabilizador', 'legs', 1, { evasion: 5, moveCost: 5 }),
  I('p_saltador', 'legs', 3, { armor: -1 }, { active: 'blink', activeCost: 8 }),
  I('p_refrigerante', 'legs', 1, { fireResist: 0.5, o2Mult: 1.05 }),
  I('p_lete', 'legs', 3, { evasion: 10, moveCost: -10, noisePerTurn: 0.04 }, { lete: true }),
  I('p_ortesis', 'legs', 1, { maxHp: 6, moveCost: 5 }),
];

export const ALL_ITEMS: ItemDef[] = [...WEAPONS, ...CONSUMABLES, ...GADGETS, ...MISC, ...IMPLANTS];

const BY_ID = new Map(ALL_ITEMS.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Objeto desconocido: ${id}`);
  return d;
}

export function hasItemDef(id: string): boolean {
  return BY_ID.has(id);
}

/** Paleta de apariencias para objetos desconocidos (inyectores). */
export const INJECTOR_LOOKS = ['ambar', 'cobalto', 'esmeralda', 'carmesi', 'perla', 'violeta', 'oxido', 'turquesa', 'negro', 'dorado'];
export const INJECTOR_COLORS = ['#e8a33a', '#3a6ee8', '#3ac46e', '#d0333e', '#e8e2d8', '#9a5ae8', '#a8552e', '#3ad0c4', '#3a3a44', '#e8cf3a'];
export const MODULE_LOOKS = ['gris', 'mate', 'rayado', 'quemado', 'pulido', 'sellado', 'antiguo', 'blanco'];
