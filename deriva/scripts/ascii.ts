import { generateFloor } from '../src/core/mapgen';
import { TILE } from '../src/core/state';
const zone = Number(process.argv[2] ?? 1) as 1;
const floor = Number(process.argv[3] ?? 1);
const seed = process.argv[4] ?? 'demo';
const t0 = performance.now();
const m = generateFloor({ zone, floor, seed, tutorial: zone === 1 && floor === 1 && seed === 'tut' });
const t1 = performance.now();
const ch: Record<number, string> = { [TILE.VOID]: ' ', [TILE.WALL]: '#', [TILE.FLOOR]: '.', [TILE.DOOR]: '+', [TILE.COVER]: 'o', [TILE.WINDOW]: '=', [TILE.PLANTS]: '"', [TILE.GRATE]: ',', [TILE.PILLAR]: 'I', [TILE.CRACKED]: '%', [TILE.BREACH]: 'X', [TILE.AIRLOCK]: 'A', [TILE.PLATE]: ':', [TILE.GIRDER]: 'H', [TILE.RUBBLE]: ';' };
const pc: Record<string, string> = { terminal: 'T', o2station: 'O', powernode: 'P', vending: '$', merchant: 'M', workbench: 'W', autosurgeon: 'S', bed: 'b', cryopod: 'c', barrel: 'B', cable: '~', container: 'k', exit: '>', entry: '<', airlockPanel: 'a', vent: 'v', camera: 'C', emlight: '!', decor: 'd', keycard: 'K', hullExit: 'E' };
const rows: string[][] = [];
for (let y = 0; y < m.h; y++) { rows.push([]); for (let x = 0; x < m.w; x++) rows[y].push(ch[m.tiles[y * m.w + x]] ?? '?'); }
for (const p of m.props) rows[p.y][p.x] = pc[p.kind] ?? '?';
for (const [k, d] of Object.entries(m.doors)) { const i = Number(k); if (d.lock) rows[Math.floor(i / m.w)][i % m.w] = d.lock[0].toUpperCase() === 'C' && d.lock === 'circuit' ? 'Z' : d.lock[0].toUpperCase(); }
console.log(rows.map((r) => r.join('')).join('\n'));
console.log(`gen ${(t1 - t0).toFixed(1)}ms attempts=${m.attempts} rooms=${m.rooms.map((r) => r.kind).join(',')} sections=${m.sections.length}`);
