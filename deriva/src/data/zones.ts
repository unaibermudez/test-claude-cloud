import type { ZoneDef, ZoneId } from '../core/content';

export const ZONES: Record<ZoneId, ZoneDef> = {
  1: {
    id: 1, w: 58, h: 36, rooms: [8, 11], roomW: [5, 10], roomH: [4, 7],
    darkChance: 0.15, vacuumChance: 0.0, radiationChance: 0, coolantChance: 0.05, sporeChance: 0,
    plants: 0, cover: 0.5, pillars: 0, windows: 0.35,
    enemyBudget: [6, 2], eliteChance: 0.04, mentalAmbient: 0,
    music: 'zone1',
    palette: {
      floor: ['#2b3039', '#353b47', '#1f232a'], wall: ['#4c5363', '#606a7b', '#353a46'],
      accent: '#7fc4e0', ambient: '#a9c2da', emergency: '#d8503e', fog: '#0a0d13',
    },
    decor: ['bed', 'table', 'locker', 'toy', 'plant_pot', 'chair', 'shelf', 'cryopod_off'],
    minis: ['anfitriona', 'nana7'], boss: 'hipnos',
  },
  2: {
    id: 2, w: 60, h: 38, rooms: [8, 12], roomW: [6, 11], roomH: [4, 8],
    darkChance: 0.3, vacuumChance: 0.03, radiationChance: 0, coolantChance: 0.05, sporeChance: 0.3,
    plants: 0.55, cover: 0.25, pillars: 0, windows: 0.45,
    enemyBudget: [10, 2], eliteChance: 0.07, mentalAmbient: 0,
    music: 'zone2',
    palette: {
      floor: ['#283121', '#333e2a', '#1e2518'], wall: ['#3d4a32', '#4f6042', '#2b3423'],
      accent: '#a6d96a', ambient: '#c2dca0', emergency: '#e3a344', fog: '#090e07',
    },
    decor: ['planter', 'hydro_tank', 'shelf', 'roots', 'plant_pot', 'table', 'locker', 'fungus'],
    minis: ['enjambre_reina', 'injerto'], boss: 'demeter',
  },
  3: {
    id: 3, w: 62, h: 38, rooms: [8, 12], roomW: [6, 12], roomH: [5, 8],
    darkChance: 0.25, vacuumChance: 0.1, radiationChance: 0.3, coolantChance: 0.2, sporeChance: 0,
    plants: 0, cover: 0.7, pillars: 0.2, windows: 0.25,
    enemyBudget: [12, 3], eliteChance: 0.1, mentalAmbient: 0,
    music: 'zone3',
    palette: {
      floor: ['#332a20', '#3f3427', '#241d16'], wall: ['#5b4732', '#70593e', '#403224'],
      accent: '#ff9d40', ambient: '#e9b47e', emergency: '#ff4b2b', fog: '#110a05',
    },
    decor: ['pipes', 'generator', 'crate', 'toolrack', 'tank', 'console', 'locker', 'valve'],
    minis: ['capataz', 'hermes'], boss: 'flegetonte',
  },
  4: {
    id: 4, w: 60, h: 38, rooms: [9, 12], roomW: [6, 11], roomH: [5, 8],
    darkChance: 0.35, vacuumChance: 0.05, radiationChance: 0.05, coolantChance: 0.05, sporeChance: 0.1,
    plants: 0, cover: 0.3, pillars: 0.5, windows: 0.2,
    enemyBudget: [13, 3], eliteChance: 0.13, mentalAmbient: 0.05,
    music: 'zone4',
    palette: {
      floor: ['#2d2937', '#393445', '#201d28'], wall: ['#5d5571', '#71678a', '#3f3951'],
      accent: '#c48cff', ambient: '#d8cbff', emergency: '#ff3f8e', fog: '#0c0913',
    },
    decor: ['tank_lab', 'console', 'gurney', 'shelf', 'crystal', 'monitor', 'locker', 'chair'],
    minis: ['paciente_cero', 'comision'], boss: 'cocito',
  },
  5: {
    id: 5, w: 62, h: 38, rooms: [9, 12], roomW: [6, 12], roomH: [5, 8],
    darkChance: 0.2, vacuumChance: 0.08, radiationChance: 0.05, coolantChance: 0.05, sporeChance: 0,
    plants: 0, cover: 0.5, pillars: 0.35, windows: 0.4,
    enemyBudget: [14, 3], eliteChance: 0.16, mentalAmbient: 0.01,
    music: 'zone5',
    palette: {
      floor: ['#1d2433', '#262f42', '#151a25'], wall: ['#3b4662', '#4b597a', '#293149'],
      accent: '#ebc76c', ambient: '#c9d6f2', emergency: '#ff5252', fog: '#060910',
    },
    decor: ['console', 'chair', 'monitor', 'map_table', 'locker', 'server', 'flag', 'shelf'],
    minis: ['ruiz', 'argos'], boss: 'estigia',
  },
  6: {
    id: 6, w: 64, h: 40, rooms: [8, 10], roomW: [5, 8], roomH: [4, 6],
    darkChance: 0.1, vacuumChance: 0, radiationChance: 0.15, coolantChance: 0, sporeChance: 0,
    plants: 0, cover: 0.3, pillars: 0, windows: 0.3,
    enemyBudget: [12, 3], eliteChance: 0.15, mentalAmbient: 0.01,
    music: 'zone6',
    exterior: true,
    palette: {
      floor: ['#3b3e44', '#484c53', '#2b2d31'], wall: ['#5b5f68', '#6d727c', '#404349'],
      accent: '#ffb46e', ambient: '#ffd6a6', emergency: '#ff6242', fog: '#000000',
    },
    decor: ['antenna', 'crate', 'console', 'tank', 'pipes', 'locker', 'generator', 'valve'],
    minis: ['remora', 'ahogado'], boss: 'aqueronte',
  },
};

export function zoneDef(z: number): ZoneDef {
  const d = ZONES[z as ZoneId];
  if (!d) throw new Error(`Zona desconocida ${z}`);
  return d;
}
