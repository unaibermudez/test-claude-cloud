import type { EnemyDef, SpriteSpec, BossDef, ZoneId } from '../core/content';

type E = Omit<EnemyDef, 'sprite' | 'zone'> & { sprite: SpriteSpec };

const P = {
  eco: ['#0b0a10', '#8a8478', '#55504a', '#d8d0c0'],
  ecoPale: ['#0b0a10', '#b8b2a8', '#7a746c', '#f0ece4'],
  robot: ['#0a0c10', '#7d8794', '#4c5560', '#c8d2de'],
  robotRust: ['#0d0906', '#9a6a44', '#5e3f28', '#e0a870'],
  plant: ['#070b05', '#5f8a3a', '#3a5a22', '#b6e07a'],
  fungus: ['#0a0806', '#a08a6a', '#6a5a44', '#e8d8b0'],
  fire: ['#120604', '#d0582a', '#7a2e14', '#ffd27a'],
  rad: ['#05100a', '#6ad08a', '#2e7a46', '#d8ffd0'],
  lete: ['#0c0814', '#9a7ac8', '#5a4680', '#f0e0ff'],
  white: ['#0c0c10', '#d8dae0', '#9a9ca6', '#ffffff'],
  navy: ['#05070c', '#4a5a80', '#2a3450', '#a8b8e0'],
  gold: ['#0c0904', '#c8a050', '#7a5e28', '#ffe8a0'],
  void: ['#000000', '#6a7080', '#3a3e48', '#d0d8e8'],
  flesh: ['#100606', '#b06060', '#6a3030', '#f0b0a0'],
} as const satisfies Record<string, readonly [string, string, string, string]>;

const sp = (base: SpriteSpec['base'], pal: keyof typeof P, eye: string, overlay?: SpriteSpec['overlay'], scale?: SpriteSpec['scale']): SpriteSpec =>
  ({ base, palette: [...P[pal]] as [string, string, string, string], eye, overlay, scale });

const z = (zone: ZoneId, list: E[]): EnemyDef[] => list.map((e) => ({ ...e, zone }));

// ------------------------------------------------------------------ Zona 1: Criogenia y Residencial
const Z1 = z(1, [
  { id: 'eco_errante', hp: 8, dmg: [1, 3], acc: 65, armor: 0, evasion: 5, speed: 90, sight: 6, hearing: 1, weight: 2, behavior: 'melee', abilities: [], eco: true, organic: true, scrap: [1, 3], threat: 2, sprite: sp('hunched', 'eco', '#7fc4e0') },
  { id: 'durmiente', hp: 7, dmg: [1, 3], acc: 70, armor: 0, evasion: 5, speed: 110, sight: 5, hearing: 1.2, weight: 2, behavior: 'ambush', abilities: [], eco: true, organic: true, scrap: [1, 3], threat: 2, sprite: sp('humanoid', 'ecoPale', '#9fe8ff', 'cracks') },
  { id: 'juguete_roto', hp: 3, dmg: [1, 2], acc: 66, armor: 0, evasion: 15, speed: 140, sight: 6, hearing: 1, weight: 1, behavior: 'swarm', abilities: [], robot: true, scrap: [1, 2], threat: 1, sprite: sp('child', 'robot', '#ff5a5a', 'antenna') },
  { id: 'servidor', hp: 11, dmg: [2, 3], acc: 68, armor: 0, evasion: 0, speed: 90, sight: 6, hearing: 0.8, weight: 2, behavior: 'melee', abilities: [], robot: true, doorBreaker: true, scrap: [2, 5], threat: 3, sprite: sp('robot', 'robot', '#7fc4e0') },
  { id: 'susurrante', hp: 6, dmg: [1, 2], acc: 85, armor: 0, evasion: 20, speed: 100, sight: 7, hearing: 1.4, weight: 1, behavior: 'stalker', abilities: ['mental'], eco: true, flying: true, darkvision: true, scrap: [0, 2], threat: 2, sprite: sp('orb', 'ecoPale', '#c48cff', 'static') },
  { id: 'enjambre_limpieza', hp: 3, dmg: [1, 1], acc: 80, armor: 0, evasion: 20, speed: 120, sight: 5, hearing: 1, weight: 1, behavior: 'swarm', abilities: [], robot: true, scrap: [0, 1], threat: 1, sprite: sp('swarm', 'robot', '#e8c46a') },
  { id: 'torreta_seg', hp: 9, dmg: [1, 3], acc: 64, armor: 1, evasion: 0, speed: 100, sight: 6, hearing: 0.5, weight: 3, behavior: 'turret', abilities: [], range: 5, robot: true, vacuumImmune: true, scrap: [3, 6], threat: 3, sprite: sp('turret', 'robot', '#ff5a5a') },
  { id: 'vigilante', hp: 9, dmg: [1, 3], acc: 64, armor: 1, evasion: 5, speed: 95, sight: 7, hearing: 1, weight: 2, behavior: 'ranged', abilities: ['callAllies'], range: 5, eco: true, organic: true, scrap: [2, 4], threat: 3, minFloor: 2, sprite: sp('humanoid', 'navy', '#ffd166', 'mask') },
]);

// ------------------------------------------------------------------ Zona 2: Jardines Hidropónicos
const Z2 = z(2, [
  { id: 'brote', hp: 8, dmg: [1, 2], acc: 70, armor: 0, evasion: 0, speed: 100, sight: 4, hearing: 0.5, weight: 3, behavior: 'stationary', abilities: ['spores'], organic: true, scrap: [0, 1], threat: 2, sprite: sp('plant', 'plant', '#e3a344') },
  { id: 'jardinero', hp: 13, dmg: [3, 5], acc: 72, armor: 0, evasion: 5, speed: 95, sight: 6, hearing: 1, weight: 2, behavior: 'melee', abilities: [], eco: true, organic: true, scrap: [1, 4], threat: 3, sprite: sp('humanoid', 'plant', '#e3a344', 'growth') },
  { id: 'raiz', hp: 10, dmg: [2, 3], acc: 80, armor: 1, evasion: 0, speed: 100, sight: 3, hearing: 1.5, weight: 3, behavior: 'ambush', abilities: ['grab'], organic: true, darkvision: true, scrap: [0, 2], threat: 2, sprite: sp('tentacle', 'fungus', '#a6d96a') },
  { id: 'polinizador', hp: 5, dmg: [1, 3], acc: 78, armor: 0, evasion: 25, speed: 150, sight: 7, hearing: 1, weight: 1, behavior: 'flyer', abilities: [], robot: true, flying: true, scrap: [1, 2], threat: 2, sprite: sp('drone', 'gold', '#a6d96a', 'wings') },
  { id: 'moho', hp: 10, dmg: [2, 3], acc: 75, armor: 0, evasion: 0, speed: 60, sight: 3, hearing: 1, weight: 2, behavior: 'melee', abilities: ['split'], organic: true, darkvision: true, scrap: [0, 1], threat: 2, sprite: sp('crawler', 'fungus', '#f0e0a0') },
  { id: 'abejas', hp: 3, dmg: [1, 2], acc: 72, armor: 0, evasion: 20, speed: 140, sight: 6, hearing: 1.2, weight: 1, behavior: 'swarm', abilities: [], robot: true, flying: true, scrap: [0, 1], threat: 1, sprite: sp('swarm', 'gold', '#ffd166') },
  { id: 'espantapajaros', hp: 18, dmg: [4, 6], acc: 85, armor: 2, evasion: 0, speed: 120, sight: 8, hearing: 0.5, weight: 3, behavior: 'stalker', abilities: [], eco: true, darkvision: true, scrap: [2, 5], threat: 4, minFloor: 2, sprite: sp('statue', 'fungus', '#ff5a5a', 'growth') },
  { id: 'compostador', hp: 24, dmg: [4, 7], acc: 70, armor: 1, evasion: 0, speed: 70, sight: 5, hearing: 1, weight: 3, behavior: 'melee', abilities: ['grab'], organic: true, eco: true, doorBreaker: true, scrap: [3, 6], threat: 4, minFloor: 2, sprite: sp('amalgam', 'plant', '#e3a344', 'growth') },
]);

// ------------------------------------------------------------------ Zona 3: Ingeniería y Reactor
const Z3 = z(3, [
  { id: 'robot_mant', hp: 16, dmg: [3, 5], acc: 75, armor: 2, evasion: 0, speed: 90, sight: 6, hearing: 0.8, weight: 3, behavior: 'melee', abilities: [], robot: true, doorBreaker: true, vacuumImmune: true, scrap: [3, 6], threat: 3, sprite: sp('robot', 'robotRust', '#ff9d40', 'cables') },
  { id: 'soldador_errante', hp: 14, dmg: [3, 6], acc: 78, armor: 1, evasion: 5, speed: 100, sight: 6, hearing: 1, weight: 2, behavior: 'melee', abilities: ['fireTrail'], robot: true, fireImmune: true, scrap: [2, 5], threat: 4, sprite: sp('humanoid', 'robotRust', '#ffd27a', 'glow') },
  { id: 'brazo_carga', hp: 24, dmg: [6, 9], acc: 70, armor: 3, evasion: 0, speed: 80, sight: 5, hearing: 0.5, weight: 3, behavior: 'stationary', abilities: [], range: 2, robot: true, vacuumImmune: true, scrap: [4, 8], threat: 4, sprite: sp('mech', 'robotRust', '#ff4b2b') },
  { id: 'dron_inspeccion', hp: 6, dmg: [1, 2], acc: 80, armor: 0, evasion: 20, speed: 120, sight: 8, hearing: 1, weight: 1, behavior: 'ranged', abilities: ['callAllies'], range: 5, robot: true, flying: true, vacuumImmune: true, scrap: [1, 3], threat: 2, sprite: sp('drone', 'robot', '#ff4b2b', 'antenna') },
  { id: 'eco_termico', hp: 15, dmg: [3, 5], acc: 75, armor: 0, evasion: 5, speed: 100, sight: 6, hearing: 1, weight: 2, behavior: 'melee', abilities: ['fireTrail'], eco: true, fireImmune: true, scrap: [1, 4], threat: 4, sprite: sp('hunched', 'fire', '#ffffff', 'glow') },
  { id: 'irradiado', hp: 14, dmg: [2, 4], acc: 75, armor: 0, evasion: 5, speed: 90, sight: 6, hearing: 1, weight: 2, behavior: 'melee', abilities: ['radiate'], eco: true, darkvision: true, scrap: [1, 4], threat: 3, sprite: sp('hunched', 'rad', '#ffffff', 'glow') },
  { id: 'cable_vivo', hp: 10, dmg: [3, 4], acc: 85, armor: 1, evasion: 0, speed: 100, sight: 3, hearing: 1.5, weight: 3, behavior: 'ambush', abilities: ['shock'], robot: true, darkvision: true, vacuumImmune: true, scrap: [1, 3], threat: 3, sprite: sp('tentacle', 'robot', '#7af0ff', 'static') },
  { id: 'bomba_presion', hp: 6, dmg: [7, 10], acc: 100, armor: 0, evasion: 10, speed: 130, sight: 6, hearing: 1.2, weight: 1, behavior: 'exploder', abilities: ['explode', 'breachMaker'], robot: true, scrap: [0, 2], threat: 3, minFloor: 2, sprite: sp('crawler', 'robotRust', '#ff4b2b', 'spikes') },
]);

// ------------------------------------------------------------------ Zona 4: Laboratorios LETE
const Z4 = z(4, [
  { id: 'sujeto', hp: 16, dmg: [3, 5], acc: 75, armor: 0, evasion: 5, speed: 95, sight: 6, hearing: 1.1, weight: 2, behavior: 'melee', abilities: ['mental'], eco: true, organic: true, scrap: [1, 4], threat: 3, sprite: sp('humanoid', 'white', '#c48cff', 'halo') },
  { id: 'doble', hp: 20, dmg: [3, 6], acc: 80, armor: 1, evasion: 10, speed: 100, sight: 7, hearing: 1, weight: 2, behavior: 'mimic', abilities: ['copy'], eco: true, scrap: [2, 6], threat: 5, minFloor: 2, sprite: sp('humanoid', 'lete', '#ffffff', 'static') },
  { id: 'reflejo', hp: 12, dmg: [4, 6], acc: 82, armor: 0, evasion: 25, speed: 110, sight: 7, hearing: 1, weight: 1, behavior: 'melee', abilities: ['teleport', 'phase'], eco: true, darkvision: true, scrap: [1, 4], threat: 4, sprite: sp('tall', 'lete', '#ffffff', 'static') },
  { id: 'archivista', hp: 12, dmg: [2, 3], acc: 80, armor: 0, evasion: 20, speed: 130, sight: 7, hearing: 1.2, weight: 1, behavior: 'thief', abilities: ['steal'], eco: true, coward: true, scrap: [4, 9], threat: 3, sprite: sp('hunched', 'lete', '#ffd166', 'mask') },
  { id: 'neurona', hp: 10, dmg: [1, 2], acc: 80, armor: 0, evasion: 15, speed: 90, sight: 6, hearing: 1, weight: 1, behavior: 'support', abilities: ['shieldAllies', 'mental'], eco: true, flying: true, scrap: [1, 3], threat: 3, sprite: sp('orb', 'lete', '#ff3f8e', 'cables') },
  { id: 'coro_menor', hp: 26, dmg: [4, 7], acc: 72, armor: 1, evasion: 0, speed: 75, sight: 6, hearing: 1, weight: 3, behavior: 'melee', abilities: ['scream'], eco: true, organic: true, doorBreaker: true, scrap: [3, 7], threat: 5, minFloor: 2, sprite: sp('amalgam', 'flesh', '#c48cff', 'halo') },
  { id: 'sin_rostro', hp: 20, dmg: [5, 8], acc: 80, armor: 1, evasion: 10, speed: 105, sight: 8, hearing: 1.3, weight: 2, behavior: 'stalker', abilities: ['darken'], eco: true, darkvision: true, scrap: [2, 6], threat: 5, minFloor: 2, sprite: sp('tall', 'white', '#000000', 'mask') },
  { id: 'eco_bata', hp: 14, dmg: [2, 4], acc: 78, armor: 0, evasion: 5, speed: 95, sight: 6, hearing: 1, weight: 2, behavior: 'support', abilities: ['heal'], range: 4, eco: true, organic: true, scrap: [2, 5], threat: 3, sprite: sp('humanoid', 'white', '#7af0ff', 'mask') },
]);

// ------------------------------------------------------------------ Zona 5: Puente y Núcleo
const Z5 = z(5, [
  { id: 'guardia_agora', hp: 22, dmg: [4, 6], acc: 75, armor: 3, evasion: 5, speed: 95, sight: 7, hearing: 1, weight: 3, behavior: 'ranged', abilities: [], range: 7, robot: true, vacuumImmune: true, scrap: [4, 8], threat: 5, sprite: sp('robot', 'navy', '#ebc76c', 'antenna') },
  { id: 'centinela', hp: 24, dmg: [5, 8], acc: 75, armor: 4, evasion: 0, speed: 100, sight: 8, hearing: 0.5, weight: 3, behavior: 'turret', abilities: [], range: 7, robot: true, vacuumImmune: true, scrap: [5, 9], threat: 5, sprite: sp('turret', 'navy', '#ff5252', 'glow') },
  { id: 'eco_oficial', hp: 20, dmg: [3, 5], acc: 75, armor: 2, evasion: 5, speed: 100, sight: 7, hearing: 1, weight: 2, behavior: 'ranged', abilities: ['callAllies'], range: 6, eco: true, organic: true, scrap: [3, 6], threat: 4, sprite: sp('humanoid', 'gold', '#ffffff', 'mask') },
  { id: 'interceptor', hp: 12, dmg: [3, 5], acc: 80, armor: 1, evasion: 25, speed: 150, sight: 8, hearing: 1, weight: 1, behavior: 'flyer', abilities: [], robot: true, flying: true, vacuumImmune: true, scrap: [2, 5], threat: 4, sprite: sp('drone', 'navy', '#ff5252', 'wings') },
  { id: 'sombra', hp: 22, dmg: [6, 9], acc: 82, armor: 1, evasion: 15, speed: 110, sight: 8, hearing: 1.3, weight: 2, behavior: 'stalker', abilities: ['phase'], eco: true, darkvision: true, scrap: [3, 7], threat: 6, minFloor: 2, sprite: sp('tall', 'navy', '#ebc76c', 'static') },
  { id: 'enjambre_datos', hp: 6, dmg: [1, 2], acc: 85, armor: 0, evasion: 25, speed: 130, sight: 6, hearing: 1, weight: 1, behavior: 'swarm', abilities: ['drainEnergy'], flying: true, vacuumImmune: true, scrap: [0, 2], threat: 2, sprite: sp('swarm', 'navy', '#7af0ff') },
  { id: 'bastion', hp: 40, dmg: [6, 10], acc: 70, armor: 5, evasion: 0, speed: 70, sight: 6, hearing: 0.7, weight: 3, behavior: 'melee', abilities: [], robot: true, doorBreaker: true, vacuumImmune: true, scrap: [6, 12], threat: 7, minFloor: 2, sprite: sp('mech', 'navy', '#ebc76c', 'spikes') },
  { id: 'vigia', hp: 10, dmg: [1, 3], acc: 85, armor: 0, evasion: 20, speed: 110, sight: 9, hearing: 1, weight: 1, behavior: 'ranged', abilities: ['blind', 'callAllies'], range: 5, robot: true, flying: true, vacuumImmune: true, scrap: [1, 4], threat: 3, sprite: sp('drone', 'gold', '#ffffff', 'antenna') },
]);

// ------------------------------------------------------------------ Zona 6: Casco exterior
const Z6 = z(6, [
  { id: 'parasito', hp: 14, dmg: [3, 5], acc: 78, armor: 1, evasion: 10, speed: 110, sight: 6, hearing: 1, weight: 2, behavior: 'melee', abilities: ['grab'], organic: true, vacuumImmune: true, scrap: [2, 4], threat: 3, sprite: sp('crawler', 'void', '#ffb46e', 'spikes') },
  { id: 'escombro', hp: 20, dmg: [5, 7], acc: 80, armor: 5, evasion: 0, speed: 100, sight: 9, hearing: 0, weight: 3, behavior: 'charger', abilities: [], flying: true, vacuumImmune: true, scrap: [3, 6], threat: 3, sprite: sp('statue', 'void', '#ff6242', 'cracks') },
  { id: 'eco_deriva', hp: 18, dmg: [4, 6], acc: 76, armor: 0, evasion: 15, speed: 100, sight: 7, hearing: 1, weight: 2, behavior: 'flyer', abilities: ['mental'], eco: true, flying: true, vacuumImmune: true, scrap: [2, 5], threat: 4, sprite: sp('humanoid', 'void', '#7fc4e0', 'halo') },
  { id: 'dron_reparacion', hp: 14, dmg: [2, 4], acc: 82, armor: 2, evasion: 15, speed: 110, sight: 7, hearing: 1, weight: 1, behavior: 'support', abilities: ['heal'], range: 3, robot: true, flying: true, vacuumImmune: true, scrap: [3, 6], threat: 3, sprite: sp('drone', 'robot', '#ffb46e', 'antenna') },
  { id: 'ancla', hp: 22, dmg: [3, 5], acc: 85, armor: 2, evasion: 0, speed: 100, sight: 6, hearing: 1, weight: 3, behavior: 'stationary', abilities: ['pull'], range: 4, organic: true, vacuumImmune: true, scrap: [2, 5], threat: 4, sprite: sp('tentacle', 'void', '#ff6242', 'growth') },
  { id: 'medusa', hp: 16, dmg: [3, 5], acc: 80, armor: 0, evasion: 20, speed: 90, sight: 6, hearing: 1, weight: 1, behavior: 'flyer', abilities: ['shock', 'phase'], eco: true, flying: true, vacuumImmune: true, darkvision: true, scrap: [2, 4], threat: 4, sprite: sp('orb', 'void', '#7af0ff', 'cables') },
  { id: 'soldador_ext', hp: 20, dmg: [4, 6], acc: 78, armor: 2, evasion: 5, speed: 95, sight: 6, hearing: 0.8, weight: 3, behavior: 'melee', abilities: ['fireTrail'], robot: true, fireImmune: true, vacuumImmune: true, scrap: [3, 6], threat: 4, sprite: sp('robot', 'void', '#ffd27a', 'glow') },
  { id: 'coro_antena', hp: 26, dmg: [3, 5], acc: 85, armor: 2, evasion: 0, speed: 100, sight: 9, hearing: 1, weight: 3, behavior: 'summoner', abilities: ['scream', 'mental'], range: 6, eco: true, vacuumImmune: true, scrap: [4, 7], threat: 5, minFloor: 2, sprite: sp('tentacle', 'lete', '#ffb46e', 'antenna') },
]);

// ------------------------------------------------------------------ mini-jefes
const mini = (zone: ZoneId, e: Omit<E, 'threat' | 'rank'>): EnemyDef => ({ ...e, zone, threat: 0, rank: 'mini' });

const B = (phases: BossDef['phases'], intro: string, death: string, music: string, extra: Partial<BossDef> = {}): BossDef => ({ phases, intro, death, music, ...extra });

const MINIS: EnemyDef[] = [
  mini(1, { id: 'anfitriona', hp: 30, dmg: [2, 3], acc: 70, armor: 0, evasion: 5, speed: 95, sight: 8, hearing: 1, weight: 3, behavior: 'boss', abilities: [], robot: true, scrap: [15, 25], sprite: sp('tall', 'robot', '#ffd166', 'mask', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'summon', summon: 'enjambre_limpieza', count: 2, cooldown: 9 }, { kind: 'line', dmg: [2, 4], cooldown: 5 }], msg: 'boss.anfitriona.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'summon', summon: 'juguete_roto', count: 2, cooldown: 8 }, { kind: 'charge', dmg: [4, 6], cooldown: 5 }], speedBonus: 15, msg: 'boss.anfitriona.p2' },
    ], 'boss.anfitriona.intro', 'boss.anfitriona.death', 'boss', { drop: ['granada'] }) }),
  mini(1, { id: 'nana7', hp: 30, dmg: [2, 3], acc: 70, armor: 0, evasion: 5, speed: 100, sight: 8, hearing: 1.3, weight: 3, behavior: 'boss', abilities: [], robot: true, scrap: [15, 25], sprite: sp('robot', 'white', '#ff9db5', 'antenna', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'scream', dmg: [1, 2], radius: 4, cooldown: 6 }, { kind: 'summon', summon: 'juguete_roto', count: 2, cooldown: 6 }], msg: 'boss.nana7.p1' },
      { hpPct: 0.45, patterns: [{ kind: 'ring', dmg: [3, 5], radius: 3, cooldown: 4 }, { kind: 'darkness', cooldown: 10 }], speedBonus: 15, msg: 'boss.nana7.p2' },
    ], 'boss.nana7.intro', 'boss.nana7.death', 'boss', { drop: ['dibujo_bruno'] }) }),
  mini(2, { id: 'enjambre_reina', hp: 42, dmg: [2, 4], acc: 82, armor: 0, evasion: 20, speed: 110, sight: 8, hearing: 1.2, weight: 3, behavior: 'boss', abilities: [], robot: true, flying: true, scrap: [18, 28], sprite: sp('orb', 'gold', '#ff5a5a', 'wings', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'summon', summon: 'abejas', count: 3, cooldown: 5 }, { kind: 'rain', dmg: [2, 4], count: 6, cooldown: 4 }], msg: 'boss.enjambre_reina.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'summon', summon: 'polinizador', count: 2, cooldown: 6 }, { kind: 'charge', dmg: [4, 6], cooldown: 3 }], speedBonus: 20, msg: 'boss.enjambre_reina.p2' },
    ], 'boss.enjambre_reina.intro', 'boss.enjambre_reina.death', 'boss') }),
  mini(2, { id: 'injerto', hp: 52, dmg: [3, 5], acc: 74, armor: 1, evasion: 0, speed: 85, sight: 7, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, organic: true, scrap: [18, 28], sprite: sp('amalgam', 'plant', '#ffd166', 'growth', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'roots', dmg: [2, 4], count: 8, cooldown: 4 }, { kind: 'slam', dmg: [5, 7], cooldown: 3 }], msg: 'boss.injerto.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'spores', radius: 3, cooldown: 6 }, { kind: 'pull', cooldown: 5 }, { kind: 'roots', dmg: [3, 5], count: 12, cooldown: 4 }], msg: 'boss.injerto.p2' },
    ], 'boss.injerto.intro', 'boss.injerto.death', 'boss') }),
  mini(3, { id: 'capataz', hp: 70, dmg: [5, 7], acc: 78, armor: 3, evasion: 0, speed: 90, sight: 8, hearing: 1, weight: 3, behavior: 'boss', abilities: [], robot: true, scrap: [22, 34], sprite: sp('mech', 'robotRust', '#ffd27a', 'antenna', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'summon', summon: 'robot_mant', count: 1, cooldown: 8 }, { kind: 'charge', dmg: [6, 8], cooldown: 4 }], msg: 'boss.capataz.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'shield', cooldown: 9 }, { kind: 'cross', dmg: [5, 7], cooldown: 4 }, { kind: 'summon', summon: 'dron_inspeccion', count: 2, cooldown: 7 }], msg: 'boss.capataz.p2' },
    ], 'boss.capataz.intro', 'boss.capataz.death', 'boss') }),
  mini(3, { id: 'hermes', hp: 80, dmg: [6, 9], acc: 72, armor: 4, evasion: 0, speed: 80, sight: 9, hearing: 0.7, weight: 3, behavior: 'boss', abilities: [], robot: true, scrap: [22, 34], sprite: sp('mech', 'gold', '#ff4b2b', 'cables', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'line', dmg: [6, 8], cooldown: 3 }, { kind: 'slam', dmg: [7, 9], cooldown: 3 }], msg: 'boss.hermes.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'pull', cooldown: 4 }, { kind: 'ring', dmg: [5, 7], radius: 2, cooldown: 3 }, { kind: 'rain', dmg: [4, 6], count: 8, cooldown: 5 }], speedBonus: 10, msg: 'boss.hermes.p2' },
    ], 'boss.hermes.intro', 'boss.hermes.death', 'boss') }),
  mini(4, { id: 'paciente_cero', hp: 90, dmg: [5, 8], acc: 80, armor: 1, evasion: 15, speed: 100, sight: 8, hearing: 1.2, weight: 3, behavior: 'boss', abilities: [], eco: true, organic: true, scrap: [25, 40], sprite: sp('tall', 'flesh', '#c48cff', 'halo', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'phantoms', count: 3, cooldown: 7 }, { kind: 'teleport', cooldown: 4 }, { kind: 'line', dmg: [5, 7], cooldown: 3 }], msg: 'boss.paciente_cero.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'scream', dmg: [3, 5], radius: 5, cooldown: 5 }, { kind: 'cross', dmg: [6, 8], cooldown: 3 }], speedBonus: 15, msg: 'boss.paciente_cero.p2' },
    ], 'boss.paciente_cero.intro', 'boss.paciente_cero.death', 'boss') }),
  mini(4, { id: 'comision', hp: 100, dmg: [5, 8], acc: 78, armor: 2, evasion: 0, speed: 85, sight: 8, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, organic: true, scrap: [25, 40], sprite: sp('amalgam', 'white', '#ff3f8e', 'mask', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'shield', cooldown: 10 }, { kind: 'summon', summon: 'neurona', count: 2, cooldown: 9 }, { kind: 'beam', dmg: [5, 7], cooldown: 4 }], msg: 'boss.comision.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'summon', summon: 'eco_bata', count: 2, cooldown: 7 }, { kind: 'ring', dmg: [5, 7], radius: 3, cooldown: 4 }, { kind: 'drain', cooldown: 6 }], msg: 'boss.comision.p2' },
    ], 'boss.comision.intro', 'boss.comision.death', 'boss', { drop: ['firma_ferran'] }) }),
  mini(5, { id: 'ruiz', hp: 120, dmg: [5, 8], acc: 80, armor: 3, evasion: 10, speed: 100, sight: 9, hearing: 1, weight: 3, behavior: 'boss', abilities: [], range: 6, eco: true, organic: true, scrap: [30, 45], sprite: sp('humanoid', 'gold', '#ffffff', 'halo', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'line', dmg: [6, 8], cooldown: 3 }, { kind: 'summon', summon: 'eco_oficial', count: 2, cooldown: 8 }], msg: 'boss.ruiz.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'shield', cooldown: 9 }, { kind: 'cross', dmg: [6, 9], cooldown: 3 }, { kind: 'rain', dmg: [4, 6], count: 10, cooldown: 5 }], speedBonus: 10, msg: 'boss.ruiz.p2' },
    ], 'boss.ruiz.intro', 'boss.ruiz.death', 'boss') }),
  mini(5, { id: 'argos', hp: 130, dmg: [5, 8], acc: 82, armor: 4, evasion: 0, speed: 90, sight: 10, hearing: 1, weight: 3, behavior: 'boss', abilities: [], range: 7, robot: true, vacuumImmune: true, scrap: [30, 45], sprite: sp('orb', 'navy', '#ff5252', 'glow', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'beam', dmg: [6, 8], cooldown: 3 }, { kind: 'summon', summon: 'vigia', count: 2, cooldown: 7 }], msg: 'boss.argos.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'rain', dmg: [5, 7], count: 12, cooldown: 4 }, { kind: 'emp', cooldown: 7 }, { kind: 'cross', dmg: [6, 8], cooldown: 3 }], msg: 'boss.argos.p2' },
    ], 'boss.argos.intro', 'boss.argos.death', 'boss') }),
  mini(6, { id: 'remora', hp: 140, dmg: [6, 9], acc: 78, armor: 3, evasion: 5, speed: 95, sight: 8, hearing: 1, weight: 3, behavior: 'boss', abilities: [], organic: true, vacuumImmune: true, scrap: [30, 45], sprite: sp('crawler', 'void', '#ffb46e', 'spikes', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'charge', dmg: [7, 9], cooldown: 3 }, { kind: 'summon', summon: 'parasito', count: 2, cooldown: 7 }], msg: 'boss.remora.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'slam', dmg: [8, 10], cooldown: 2 }, { kind: 'ring', dmg: [5, 7], radius: 2, cooldown: 4 }], speedBonus: 15, msg: 'boss.remora.p2' },
    ], 'boss.remora.intro', 'boss.remora.death', 'boss') }),
  mini(6, { id: 'ahogado', hp: 130, dmg: [5, 8], acc: 80, armor: 1, evasion: 10, speed: 100, sight: 8, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, flying: true, vacuumImmune: true, scrap: [30, 45], sprite: sp('humanoid', 'void', '#7fc4e0', 'cables', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'pull', cooldown: 4 }, { kind: 'ring', dmg: [5, 7], radius: 3, cooldown: 4 }], msg: 'boss.ahogado.p1' },
      { hpPct: 0.5, patterns: [{ kind: 'phantoms', count: 3, cooldown: 7 }, { kind: 'scream', dmg: [3, 5], radius: 5, cooldown: 5 }, { kind: 'line', dmg: [6, 8], cooldown: 3 }], msg: 'boss.ahogado.p2' },
    ], 'boss.ahogado.intro', 'boss.ahogado.death', 'boss') }),
];

// ------------------------------------------------------------------ jefes de zona
const boss = (zone: ZoneId, e: Omit<E, 'threat' | 'rank'>): EnemyDef => ({ ...e, zone, threat: 0, rank: 'boss' });

const BOSSES: EnemyDef[] = [
  boss(1, { id: 'hipnos', hp: 66, dmg: [3, 5], acc: 72, armor: 0, evasion: 0, speed: 85, sight: 10, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, organic: true, scrap: [40, 60], sprite: sp('amalgam', 'ecoPale', '#9fe8ff', 'cracks', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'summon', summon: 'durmiente', count: 1, cooldown: 7 }, { kind: 'slam', dmg: [3, 5], cooldown: 3 }], msg: 'boss.hipnos.p1', mechanic: 'pods' },
      { hpPct: 0.66, patterns: [{ kind: 'cold', radius: 3, cooldown: 5 }, { kind: 'cross', dmg: [5, 7], cooldown: 3 }], msg: 'boss.hipnos.p2' },
      { hpPct: 0.33, patterns: [{ kind: 'ring', dmg: [4, 6], radius: 3, cooldown: 3 }, { kind: 'rain', dmg: [4, 6], count: 8, cooldown: 4 }, { kind: 'charge', dmg: [6, 8], cooldown: 4 }], speedBonus: 20, msg: 'boss.hipnos.p3' },
    ], 'boss.hipnos.intro', 'boss.hipnos.death', 'boss1', { flag: 'boss_hipnos' }) }),
  boss(2, { id: 'demeter', hp: 120, dmg: [4, 6], acc: 76, armor: 1, evasion: 0, speed: 80, sight: 10, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, organic: true, scrap: [45, 65], sprite: sp('plant', 'plant', '#ffd166', 'growth', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'roots', dmg: [3, 5], count: 10, cooldown: 3 }, { kind: 'summon', summon: 'brote', count: 2, cooldown: 7 }], msg: 'boss.demeter.p1', mechanic: 'roots' },
      { hpPct: 0.66, patterns: [{ kind: 'spores', radius: 5, cooldown: 6 }, { kind: 'line', dmg: [5, 7], cooldown: 3 }, { kind: 'darkness', cooldown: 9 }], msg: 'boss.demeter.p2' },
      { hpPct: 0.33, patterns: [{ kind: 'heal', cooldown: 8 }, { kind: 'ring', dmg: [5, 7], radius: 3, cooldown: 3 }, { kind: 'rain', dmg: [4, 6], count: 10, cooldown: 4 }], speedBonus: 15, msg: 'boss.demeter.p3' },
    ], 'boss.demeter.intro', 'boss.demeter.death', 'boss2', { flag: 'boss_demeter' }) }),
  boss(3, { id: 'flegetonte', hp: 190, dmg: [6, 9], acc: 78, armor: 3, evasion: 0, speed: 85, sight: 10, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, fireImmune: true, scrap: [50, 75], sprite: sp('mech', 'fire', '#ffffff', 'glow', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'firewave', dmg: [5, 7], cooldown: 3 }, { kind: 'rain', dmg: [4, 6], count: 8, cooldown: 4 }], msg: 'boss.flegetonte.p1' },
      { hpPct: 0.66, patterns: [{ kind: 'shield', cooldown: 12 }, { kind: 'ring', dmg: [6, 8], radius: 3, cooldown: 3 }, { kind: 'summon', summon: 'eco_termico', count: 2, cooldown: 8 }], msg: 'boss.flegetonte.p2', mechanic: 'coolant' },
      { hpPct: 0.33, patterns: [{ kind: 'cold', radius: 4, cooldown: 4 }, { kind: 'beam', dmg: [7, 9], cooldown: 3 }, { kind: 'firewave', dmg: [6, 8], cooldown: 4 }], speedBonus: 20, msg: 'boss.flegetonte.p3' },
    ], 'boss.flegetonte.intro', 'boss.flegetonte.death', 'boss3', { flag: 'boss_flegetonte', drop: ['anillo_samuel'] }) }),
  boss(4, { id: 'cocito', hp: 230, dmg: [6, 9], acc: 82, armor: 2, evasion: 15, speed: 100, sight: 10, hearing: 1.2, weight: 3, behavior: 'boss', abilities: [], eco: true, scrap: [55, 80], sprite: sp('humanoid', 'lete', '#ffffff', 'static', 2),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'mirror', cooldown: 3 }, { kind: 'teleport', cooldown: 4 }, { kind: 'line', dmg: [6, 8], cooldown: 3 }], msg: 'boss.cocito.p1', mechanic: 'mirror' },
      { hpPct: 0.66, patterns: [{ kind: 'scream', dmg: [3, 5], radius: 6, cooldown: 5 }, { kind: 'phantoms', count: 4, cooldown: 7 }, { kind: 'darkness', cooldown: 9 }], msg: 'boss.cocito.p2', mechanic: 'darkArena' },
      { hpPct: 0.33, patterns: [{ kind: 'cross', dmg: [7, 9], cooldown: 3 }, { kind: 'ring', dmg: [6, 8], radius: 3, cooldown: 3 }, { kind: 'beam', dmg: [7, 10], cooldown: 4 }, { kind: 'summon', summon: 'sujeto', count: 2, cooldown: 8 }], speedBonus: 20, msg: 'boss.cocito.p3' },
    ], 'boss.cocito.intro', 'boss.cocito.death', 'boss4', { flag: 'boss_cocito' }) }),
  boss(5, { id: 'estigia', hp: 280, dmg: [7, 10], acc: 82, armor: 4, evasion: 5, speed: 95, sight: 12, hearing: 1, weight: 3, behavior: 'boss', abilities: [], robot: true, vacuumImmune: true, scrap: [60, 90], sprite: sp('orb', 'navy', '#ebc76c', 'halo', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'shield', cooldown: 14 }, { kind: 'beam', dmg: [6, 9], cooldown: 3 }, { kind: 'summon', summon: 'guardia_agora', count: 1, cooldown: 9 }, { kind: 'emp', cooldown: 8 }], msg: 'boss.estigia.p1', mechanic: 'shieldTerminals' },
      { hpPct: 0.66, patterns: [{ kind: 'vent', cooldown: 10 }, { kind: 'pull', cooldown: 5 }, { kind: 'rain', dmg: [5, 8], count: 12, cooldown: 4 }], msg: 'boss.estigia.p2', mechanic: 'vacuum' },
      { hpPct: 0.33, patterns: [{ kind: 'cross', dmg: [7, 10], cooldown: 3 }, { kind: 'ring', dmg: [6, 9], radius: 3, cooldown: 3 }, { kind: 'phantoms', count: 3, cooldown: 8 }, { kind: 'darkness', cooldown: 10 }], speedBonus: 20, msg: 'boss.estigia.p3' },
    ], 'boss.estigia.intro', 'boss.estigia.death', 'boss5', { flag: 'boss_final' }) }),
  boss(5, { id: 'coro_pleno', hp: 260, dmg: [6, 9], acc: 80, armor: 2, evasion: 5, speed: 95, sight: 12, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, organic: true, scrap: [60, 90], sprite: sp('amalgam', 'lete', '#ffffff', 'halo', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'scream', dmg: [3, 5], radius: 5, cooldown: 5 }, { kind: 'summon', summon: 'coro_menor', count: 1, cooldown: 9 }, { kind: 'line', dmg: [6, 8], cooldown: 3 }], msg: 'boss.coro_pleno.p1' },
      { hpPct: 0.66, patterns: [{ kind: 'phantoms', count: 4, cooldown: 7 }, { kind: 'drain', cooldown: 6 }, { kind: 'rain', dmg: [5, 7], count: 10, cooldown: 4 }], msg: 'boss.coro_pleno.p2', mechanic: 'darkArena' },
      { hpPct: 0.33, patterns: [{ kind: 'cross', dmg: [7, 9], cooldown: 3 }, { kind: 'ring', dmg: [6, 8], radius: 4, cooldown: 3 }, { kind: 'teleport', cooldown: 4 }], speedBonus: 20, msg: 'boss.coro_pleno.p3' },
    ], 'boss.coro_pleno.intro', 'boss.coro_pleno.death', 'boss5', { flag: 'boss_final' }) }),
  boss(6, { id: 'aqueronte', hp: 300, dmg: [7, 10], acc: 80, armor: 3, evasion: 5, speed: 95, sight: 12, hearing: 1, weight: 3, behavior: 'boss', abilities: [], eco: true, flying: true, vacuumImmune: true, scrap: [70, 100], sprite: sp('tentacle', 'void', '#ffb46e', 'halo', 3),
    boss: B([
      { hpPct: 1, patterns: [{ kind: 'line', dmg: [6, 9], cooldown: 3 }, { kind: 'charge', dmg: [7, 9], cooldown: 4 }], msg: 'boss.aqueronte.p1', mechanic: 'drift' },
      { hpPct: 0.66, patterns: [{ kind: 'pull', cooldown: 4 }, { kind: 'rain', dmg: [5, 8], count: 12, cooldown: 4 }, { kind: 'summon', summon: 'eco_deriva', count: 2, cooldown: 8 }], msg: 'boss.aqueronte.p2' },
      { hpPct: 0.33, patterns: [{ kind: 'ring', dmg: [6, 9], radius: 4, cooldown: 3 }, { kind: 'beam', dmg: [8, 10], cooldown: 3 }, { kind: 'quake', dmg: [3, 5], cooldown: 5 }], speedBonus: 20, msg: 'boss.aqueronte.p3' },
    ], 'boss.aqueronte.intro', 'boss.aqueronte.death', 'boss6', { flag: 'boss_aqueronte' }) }),
];

// ------------------------------------------------------------------ aliados, PNJ y especiales
const SPECIAL: EnemyDef[] = [
  { id: 'player', zone: 1, hp: 30, dmg: [1, 2], acc: 80, armor: 0, evasion: 5, speed: 100, sight: 9, hearing: 1, weight: 2, behavior: 'melee', abilities: [], organic: true, scrap: [0, 0], threat: 0, sprite: sp('humanoid', 'robot', '#ffffff') },
  { id: 'dron_aliado', zone: 1, hp: 8, dmg: [2, 3], acc: 85, armor: 1, evasion: 20, speed: 110, sight: 7, hearing: 1, weight: 1, behavior: 'ranged', abilities: [], range: 4, robot: true, flying: true, vacuumImmune: true, scrap: [0, 0], threat: 0, sprite: sp('drone', 'robot', '#7af0ff', 'antenna') },
  { id: 'robot_aliado', zone: 3, hp: 16, dmg: [3, 5], acc: 75, armor: 2, evasion: 0, speed: 90, sight: 6, hearing: 1, weight: 3, behavior: 'melee', abilities: [], robot: true, scrap: [0, 0], threat: 0, sprite: sp('robot', 'robot', '#9be36b', 'cables') },
  { id: 'senuelo', zone: 1, hp: 6, dmg: [0, 0], acc: 0, armor: 0, evasion: 0, speed: 100, sight: 0, hearing: 0, weight: 1, behavior: 'stationary', abilities: [], scrap: [0, 0], threat: 0, sprite: sp('humanoid', 'lete', '#ffffff', 'static') },
  { id: 'npc_solis', zone: 1, hp: 34, dmg: [4, 6], acc: 82, armor: 2, evasion: 10, speed: 100, sight: 8, hearing: 1, weight: 2, behavior: 'ranged', abilities: [], range: 7, organic: true, scrap: [10, 15], threat: 0, sprite: sp('humanoid', 'navy', '#ffffff', 'mask') },
  { id: 'npc_celia_eco', zone: 3, hp: 40, dmg: [4, 7], acc: 78, armor: 1, evasion: 5, speed: 100, sight: 7, hearing: 1, weight: 2, behavior: 'melee', abilities: ['mental'], eco: true, organic: true, scrap: [8, 12], threat: 0, sprite: sp('humanoid', 'ecoPale', '#c48cff', 'halo') },
];

export const ENEMIES: EnemyDef[] = [...Z1, ...Z2, ...Z3, ...Z4, ...Z5, ...Z6, ...MINIS, ...BOSSES, ...SPECIAL];
const BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));

export function enemyDef(id: string): EnemyDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Enemigo desconocido: ${id}`);
  return d;
}

export function hasEnemy(id: string): boolean {
  return BY_ID.has(id);
}

export const REGULAR_ENEMIES = ENEMIES.filter((e) => !e.rank && e.threat > 0);
export const BESTIARY_IDS = ENEMIES.filter((e) => e.threat > 0 || e.rank).map((e) => e.id);

/** Modificadores de élite. */
export const ELITES = ['resonante', 'blindado', 'veloz', 'voraz', 'inestable'] as const;
export type EliteId = (typeof ELITES)[number];
