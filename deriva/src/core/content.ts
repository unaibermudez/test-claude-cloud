/**
 * Tipos de las definiciones de contenido (armas, objetos, enemigos, escenas…).
 * Los datos concretos viven en `src/data/` y referencian claves de i18n.
 */

export type ZoneId = 1 | 2 | 3 | 4 | 5 | 6;
export type AmmoType = 'balas' | 'cartuchos' | 'clavos' | 'virotes';
export type ImplantSlot = 'brain' | 'eyes' | 'torso' | 'arms' | 'legs';
export const IMPLANT_SLOTS: readonly ImplantSlot[] = ['brain', 'eyes', 'torso', 'arms', 'legs'];

export type WeaponTrait =
  | 'knockback' | 'pierce' | 'fire' | 'stun' | 'emp' | 'bleed' | 'silent' | 'loud' | 'reach'
  | 'chain' | 'cone' | 'aoe' | 'harpoon' | 'mental' | 'light' | 'heavy' | 'fast' | 'crush'
  | 'lifesteal' | 'freeze' | 'breach';

export interface WeaponDef {
  kind: 'melee' | 'ranged';
  dmg: [number, number];
  acc: number;
  range: number; // alcance óptimo (melee: 1 o 2)
  ammo?: AmmoType | 'energy';
  ammoPer?: number;
  noise: number;
  traits: WeaponTrait[];
  cost?: number; // coste de acción (100 = un turno)
  aoe?: number; // radio
}

/** Modificadores de estadísticas (implantes, mejoras, clases). Los multiplicadores se componen. */
export interface Mods {
  maxHp?: number;
  maxO2?: number;
  maxEnergy?: number;
  o2Mult?: number;
  energyMult?: number;
  sight?: number;
  nightVision?: boolean;
  armor?: number;
  evasion?: number;
  acc?: number;
  melee?: number;
  ranged?: number;
  moveCost?: number; // suma al coste de movimiento
  noiseMult?: number; // multiplicador del ruido emitido
  hack?: number; // casillas extra de búfer
  radResist?: number; // 0..1
  fireResist?: number; // 0..1
  mentalMult?: number; // multiplicador de ganancia de ruido mental
  magboots?: boolean;
  regen?: number; // turnos por punto de vida (0 = nada)
  energyRegen?: number; // energía por turno
  crit?: number;
  healMult?: number;
  light?: number; // radio extra de linterna
  scrapMult?: number;
  seeHidden?: boolean;
  noisePerTurn?: number; // ruido mental pasivo
  migraine?: number; // probabilidad por turno de quedar aturdido
  stealthKill?: number; // multiplicador extra de ataque furtivo
  vacuum?: number; // reducción del consumo en vacío (0..1)
  pushPower?: number;
  shield?: number; // absorción por golpe si hay energía
  thermal?: boolean; // ve enemigos orgánicos a través de paredes cercanas
  sense?: number; // radio de detección de enemigos a través de paredes
}

export interface ConsumableEffect {
  heal?: number;
  o2?: number;
  energy?: number;
  noise?: number;
  status?: { id: string; turns: number };
  cleanse?: boolean;
  identifyAll?: boolean;
  reveal?: boolean;
  maxHp?: number;
  damage?: number;
  randomImplantBuff?: boolean;
}

export interface GadgetDef {
  kind: 'grenade' | 'sealer' | 'beacon' | 'drone' | 'flare' | 'mine' | 'charge' | 'emp' | 'decoy' | 'foam';
  radius?: number;
  dmg?: [number, number];
  traits?: WeaponTrait[];
  range: number;
}

export interface ImplantDef {
  slot: ImplantSlot;
  mods: Mods;
  lete?: boolean;
  active?: 'cloak' | 'overclock' | 'pulse' | 'shield' | 'blink' | 'scan' | 'heal';
  activeCost?: number;
  rarity: 1 | 2 | 3;
}

export type ItemType =
  | 'weapon' | 'consumable' | 'gadget' | 'implant' | 'key' | 'quest' | 'part' | 'ammo' | 'suit' | 'kit';

export interface ItemDef {
  id: string;
  type: ItemType;
  price: number;
  tier: number; // zona mínima de aparición (0 = no aparece al azar)
  stack?: number;
  unknown?: 'injector' | 'module';
  weapon?: WeaponDef;
  consumable?: ConsumableEffect;
  gadget?: GadgetDef;
  implant?: ImplantDef;
  ammo?: { type: AmmoType; amount: number };
  icon: string; // id de icono en render/icons
  color: string;
  weight?: number; // probabilidad relativa en botín
}

export type Behavior =
  | 'melee' | 'ranged' | 'ambush' | 'swarm' | 'stationary' | 'turret' | 'stalker'
  | 'summoner' | 'exploder' | 'flyer' | 'support' | 'mimic' | 'thief' | 'charger' | 'boss';

export type Ability =
  | 'spores' | 'grab' | 'teleport' | 'mental' | 'drainO2' | 'drainEnergy' | 'heal' | 'explode'
  | 'callAllies' | 'fireTrail' | 'radiate' | 'shock' | 'web' | 'split' | 'copy' | 'steal'
  | 'regen' | 'shieldAllies' | 'blind' | 'darken' | 'burrow' | 'reflect' | 'phase' | 'scream'
  | 'leap' | 'breachMaker' | 'emp' | 'sing' | 'freeze' | 'pull';

export type SpriteBase =
  | 'humanoid' | 'hunched' | 'robot' | 'drone' | 'swarm' | 'plant' | 'orb' | 'turret' | 'amalgam'
  | 'quad' | 'tall' | 'child' | 'crawler' | 'statue' | 'tentacle' | 'mech';

export interface SpriteSpec {
  base: SpriteBase;
  palette: [string, string, string, string]; // contorno, base, sombra, brillo
  eye?: string;
  overlay?: 'cables' | 'growth' | 'glow' | 'cracks' | 'mask' | 'antenna' | 'spikes' | 'halo' | 'static' | 'wings';
  scale?: 1 | 2 | 3;
}

export interface EnemyDef {
  id: string;
  zone: ZoneId;
  hp: number;
  dmg: [number, number];
  acc: number;
  armor: number;
  evasion: number;
  speed: number;
  sight: number;
  hearing: number;
  weight: 1 | 2 | 3;
  behavior: Behavior;
  abilities: Ability[];
  range?: number;
  darkvision?: boolean;
  flying?: boolean;
  robot?: boolean;
  eco?: boolean;
  organic?: boolean;
  fireImmune?: boolean;
  vacuumImmune?: boolean;
  doorBreaker?: boolean;
  coward?: boolean;
  scrap: [number, number];
  threat: number; // coste en el presupuesto de generación
  sprite: SpriteSpec;
  rank?: 'mini' | 'boss';
  boss?: BossDef;
  minFloor?: number; // piso mínimo dentro de la zona
  sfx?: string;
}

export type PatternKind =
  | 'slam' | 'line' | 'cross' | 'ring' | 'rain' | 'summon' | 'charge' | 'vent' | 'gas' | 'teleport'
  | 'shield' | 'heal' | 'mirror' | 'darkness' | 'drain' | 'roots' | 'spores' | 'firewave' | 'pull'
  | 'emp' | 'phantoms' | 'beam' | 'cold' | 'quake' | 'scream';

export interface BossPattern {
  kind: PatternKind;
  dmg?: [number, number];
  radius?: number;
  count?: number;
  summon?: string;
  cooldown: number;
  delay?: number; // turnos de aviso (por defecto 1)
}

export interface BossPhase {
  hpPct: number; // la fase empieza cuando la vida baja de este porcentaje (1 = desde el inicio)
  patterns: BossPattern[];
  speedBonus?: number;
  msg: string; // clave i18n
  mechanic?: 'shieldTerminals' | 'pods' | 'darkArena' | 'coolant' | 'mirror' | 'vacuum' | 'roots' | 'drift';
}

export interface BossDef {
  phases: BossPhase[];
  intro: string; // clave i18n
  death: string; // clave i18n
  music: string;
  drop?: string[]; // objetos garantizados
  flag?: string; // bandera de partida al morir
}

// ---------- Narrativa ----------

export type NpcId = 'celia' | 'tomas' | 'bruno' | 'solis' | 'lenz' | 'faro';
export type SpeakerId = NpcId | 'agora' | 'narrator' | 'player' | 'tuerca' | 'coro' | 'radio' | 'unknown' | 'ferran' | 'lucia';

export type Cond =
  | { flag: string; gte?: number; eq?: number }
  | { meta: string; gte?: number; eq?: number }
  | { trustGte: number }
  | { trustLt: number }
  | { arcGte: [NpcId, number] }
  | { arcEq: [NpcId, number] }
  | { has: string }
  | { deathsGte: number }
  | { logsGte: number }
  | { logs: string[] }
  | { ending: string }
  | { zone: number }
  | { noiseGte: number }
  | { energyGte: number }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

export type Effect =
  | { trust: number }
  | { flag: string; v?: number; add?: number }
  | { meta: string; v?: number; add?: number }
  | { arc: NpcId; stage: number }
  | { fate: NpcId; v: string }
  | { give: string; n?: number }
  | { take: string; n?: number }
  | { hp: number }
  | { o2: number }
  | { energy: number }
  | { noise: number }
  | { scrap: number }
  | { maxHp: number }
  | { memorias: number }
  | { log: string }
  | { reveal: true }
  | { spawn: string; n?: number }
  | { hostileNpc: true }
  | { removeNpc: true }
  | { ending: string }
  | { identify: true }
  | { survivors: number }
  | { vent: true }
  | { msg: string }
  | { allies: number }
  | { implant: string }
  | { heal: number }
  | { killNear: string }
  | { status: string; turns: number }
  | { sfx: string };

export interface DialogOption {
  text: string;
  cond?: Cond;
  effects?: Effect[];
  next?: string | null;
  hideIfLocked?: boolean;
}

export interface DialogNode {
  speaker: SpeakerId;
  text: string;
  effects?: Effect[];
  options?: DialogOption[];
  next?: string | null;
}

export interface SceneDef {
  id: string;
  kind: 'npc' | 'event' | 'radio' | 'agora' | 'ending';
  npc?: NpcId;
  stage?: number; // etapa del arco requerida (exacta)
  zones: number[];
  floors?: number[]; // pisos dentro de la zona (1-4)
  cond?: Cond;
  once?: 'run' | 'meta';
  start: string;
  nodes: Record<string, DialogNode>;
  weight?: number;
  setsStage?: number;
  repeat?: boolean; // no se marca como vista al empezar (escenas de entrega)
  title: string; // clave i18n
}

export interface LogDef {
  id: string;
  zone: ZoneId;
  kind: 'diario' | 'correo' | 'grabacion' | 'informe' | 'nota' | 'pintada' | 'placa' | 'acta' | 'lista' | 'manual' | 'transcripcion' | 'bitacora' | 'orden' | 'plan' | 'solicitud' | 'registro';
  cond?: Cond;
  fixedFloor?: number;
  truth?: boolean; // revela la verdad sobre 114
}

export interface EndingDef {
  id: string;
  kind: 'main' | 'death' | 'true';
  cond?: Cond;
  music: string;
  memorias: number;
}

export interface ClassDef {
  id: string;
  hp: number;
  o2: number;
  energy: number;
  mods: Mods;
  start: { item: string; n?: number }[];
  ammo: Partial<Record<AmmoType, number>>;
  implants?: string[];
  unlock: string | null; // nodo de mejora o bandera meta
  suit: [string, string, string, string];
}

export type UpgradeBranch = 'supervivencia' | 'tecnica' | 'sigilo' | 'memoria' | 'acceso' | 'laboratorio';

export interface UpgradeDef {
  id: string;
  branch: UpgradeBranch;
  cost: number;
  req: string[];
  mods?: Mods;
  start?: { item: string; n?: number }[];
  unlockClass?: string;
  unlockImplants?: string[];
  startZone?: number;
  orbit?: number;
  trust?: number;
  scrap?: number;
  flag?: string;
  pos: [number, number]; // posición en el árbol (columna, fila)
}

export interface AchievementDef {
  id: string;
  icon: string;
  secret?: boolean;
}

export interface ZoneDef {
  id: ZoneId;
  w: number;
  h: number;
  rooms: [number, number];
  roomW: [number, number];
  roomH: [number, number];
  darkChance: number;
  vacuumChance: number;
  radiationChance: number;
  coolantChance: number;
  sporeChance: number;
  plants: number;
  cover: number;
  pillars: number;
  windows: number;
  enemyBudget: [number, number]; // por piso (base, +por piso)
  eliteChance: number;
  mentalAmbient: number;
  music: string;
  palette: ZonePalette;
  decor: string[];
  minis: [string, string];
  boss: string;
  exterior?: boolean;
}

export interface ZonePalette {
  floor: [string, string, string];
  wall: [string, string, string];
  accent: string;
  ambient: string; // color de luz ambiente
  emergency: string;
  fog: string;
}
