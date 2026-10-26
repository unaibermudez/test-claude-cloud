import type { RngState } from './rng';
import type { AmmoType, ImplantSlot, NpcId, ZoneId } from './content';

/** Tipos de casilla. */
export const TILE = {
  VOID: 0,
  WALL: 1,
  FLOOR: 2,
  DOOR: 3,
  COVER: 4,
  WINDOW: 5,
  PLANTS: 6,
  GRATE: 7,
  PILLAR: 8,
  CRACKED: 9,
  BREACH: 10,
  AIRLOCK: 11,
  PLATE: 12,
  GIRDER: 13,
  RUBBLE: 14,
} as const;
export type TileId = (typeof TILE)[keyof typeof TILE];

export type LockKind = 'amber' | 'cyan' | 'violet' | 'circuit' | 'boss';

export interface DoorState {
  open: boolean;
  lock: LockKind | null;
  sealed: boolean;
  broken: boolean;
}

export interface Section {
  id: number;
  pressure: number;
  radiation: number;
  coolant: boolean;
  dark: boolean;
  lifeSupport: boolean;
  vent: number; // turnos de ventilación forzada restantes
  size: number;
  ventedByPlayer: boolean;
}

export type RoomKind =
  | 'normal' | 'start' | 'exit' | 'shop' | 'event' | 'rest' | 'lab' | 'workshop' | 'secret'
  | 'boss' | 'ante' | 'vault' | 'airlock' | 'mini' | 'module';

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: RoomKind;
}

export type PropKind =
  | 'terminal' | 'o2station' | 'powernode' | 'vending' | 'merchant' | 'workbench' | 'autosurgeon'
  | 'bed' | 'cryopod' | 'barrel' | 'cable' | 'container' | 'exit' | 'entry' | 'airlockPanel'
  | 'vent' | 'log' | 'npc' | 'event' | 'camera' | 'emlight' | 'decor' | 'keycard' | 'hullExit'
  | 'core' | 'corpse' | 'radio';

export interface ShopEntry { item: string; price: number; n: number }

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  used?: boolean;
  charges?: number;
  hack?: number; // dificultad 1..5
  hacked?: boolean;
  lockout?: number;
  loot?: ItemStack[];
  log?: string;
  scene?: string;
  npc?: NpcId;
  link?: number;
  stock?: ShopEntry[];
  variant?: number;
  hp?: number;
  key?: LockKind;
  dir?: number;
  off?: boolean;
  sec?: number;
  label?: string;
}

export interface FloorItem { id: number; x: number; y: number; item: ItemStack }

export interface ItemStack { id: string; n: number; cursed?: boolean }

export type AiMode = 'idle' | 'patrol' | 'alert' | 'hunt' | 'flee' | 'dormant' | 'guard';

export interface AiState {
  mode: AiMode;
  tx: number;
  ty: number;
  timer: number;
  cd: Record<string, number>;
  homeX: number;
  homeY: number;
}

export interface Telegraph {
  tiles: number[];
  dmg: [number, number];
  effect?: string;
  delay: number;
  source: number;
  kind: string;
}

export interface BossState {
  phase: number;
  turn: number;
  cds: number[];
  shield: boolean;
  enraged: boolean;
}

export type Faction = 'player' | 'enemy' | 'npc' | 'ally';

export interface Actor {
  id: number;
  def: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ap: number;
  faction: Faction;
  ai: AiState;
  status: Record<string, number>;
  elite?: string;
  phantom?: boolean;
  vx?: number;
  vy?: number;
  facing: number;
  boss?: BossState;
  dead?: boolean;
  npc?: NpcId;
  summoned?: boolean;
  ttl?: number;
  carry?: string;
  zoneSummon?: string;
}

export interface ImplantInst { id: string; cursed?: boolean }

export interface PlayerState {
  name: string;
  pronoun: Pronoun;
  classId: string;
  o2: number;
  energy: number;
  noise: number;
  scrap: number;
  inv: ItemStack[];
  melee: ItemStack | null;
  ranged: ItemStack | null;
  implants: Record<ImplantSlot, ImplantInst | null>;
  keys: LockKind[];
  flashlight: boolean;
  sneak: boolean;
  ammo: Record<AmmoType, number>;
  suit: boolean;
  regenAcc: number;
  lastHitBy: string;
  drifting: boolean;
  activeCd: number;
  cloak: number;
}

export type Pronoun = 'el' | 'ella' | 'elle';

export interface RunNarrative {
  trust: number;
  flags: Record<string, number>;
  scenesDone: string[];
  logsFound: string[];
  survivors: number;
  agoraHelp: { identify: number; door: number; recharge: number; map: number };
}

export interface RunStats {
  kills: number;
  killsByDef: Record<string, number>;
  damageDealt: number;
  damageTaken: number;
  turns: number;
  floors: number;
  bosses: number;
  minis: number;
  hacks: number;
  hacksFailed: number;
  vented: number;
  stealthKills: number;
  itemsUsed: number;
  scrapEarned: number;
  o2Used: number;
  maxNoise: number;
  doorsSealed: number;
  ejected: number;
  pushes: number;
  envKills: number;
  phantomsHit: number;
  closeCalls: number;
  combatTurns: number;
  logsNew: number;
  eventsResolved: number;
}

export type Modal =
  | { kind: 'dialog'; scene: string; node: string; propId?: number }
  | { kind: 'hack'; propId: number; hack: HackState; purpose: string }
  | { kind: 'shop'; propId: number }
  | { kind: 'workbench'; propId: number }
  | { kind: 'terminal'; propId: number }
  | { kind: 'surgeon'; propId: number }
  | { kind: 'ending' };

export interface HackState {
  n: number;
  grid: string[];
  buffer: number;
  picks: number[]; // índices elegidos
  targets: { seq: string[]; reward: string; done: boolean }[];
  axis: 'row' | 'col';
  line: number; // fila o columna activa
  finished: boolean;
  success: boolean;
  solution: number[]; // ruta válida para el modo asistido
}

export type GameMode = 'historia' | 'dificil' | 'diario' | 'semilla' | 'pesadilla';

export interface RunOptions {
  mode: GameMode;
  seed: string;
  classId: string;
  name: string;
  pronoun: Pronoun;
  generousO2: boolean;
  assistHack: boolean;
  skipHack: boolean;
  dullEnemies: boolean;
  longOrbit: boolean;
  startZone: ZoneId;
}

export interface FloorMap {
  w: number;
  h: number;
  zone: ZoneId;
  floor: number; // 1..4 dentro de la zona (4 = jefe)
  boss: boolean;
  tiles: number[];
  sec: number[];
  sections: Section[];
  rooms: Room[];
  doors: Record<number, DoorState>;
  props: Prop[];
  seen: number[];
  fire: number[];
  gas: number[];
  entry: { x: number; y: number };
  exit: { x: number; y: number };
  event: string | null;
  eventTurn: number;
  exteriorExit?: { x: number; y: number };
  radio?: string | null;
  genSeed: string;
  attempts: number;
}

export interface GameOver {
  cause: string; // clave de causa
  ending: string | null;
  victory: boolean;
}

export interface RunState {
  version: number;
  seed: string;
  rng: RngState;
  vrng: RngState; // para fantasmas/efectos de lógica cosmética
  opts: RunOptions;
  perks: string[]; // mejoras meta activas
  turn: number;
  floorTurn: number;
  orbit: number; // turnos restantes antes del reingreso
  timeAcc: number;
  zone: ZoneId;
  floorNo: number; // contador global de pisos
  map: FloorMap;
  actors: Actor[];
  items: FloorItem[];
  telegraphs: Telegraph[];
  nextId: number;
  player: PlayerState;
  pid: number; // id del actor jugador
  narrative: RunNarrative;
  stats: RunStats;
  known: Record<string, true>;
  appear: Record<string, number>;
  modal: Modal | null;
  over: GameOver | null;
  hullRoute: boolean; // la ruta actual pasa por el casco exterior
  visitedZones: number[];
  bossesDefeated: string[];
  metaSnapshot: MetaSnapshot;
  lastNoise: { x: number; y: number; r: number; turn: number } | null;
  hallucinationTimer: number;
  floorDecay: number;
}

/** Datos de meta-progresión que la lógica de partida necesita consultar (copiados al crear la partida). */
export interface MetaSnapshot {
  deaths: number;
  arcs: Record<NpcId, number>;
  flags: Record<string, number>;
  logs: string[];
  endings: string[];
  runs: number;
  fates: Record<string, string>;
}
