import { _internal } from '../src/core/mapgen';
import { createRng } from '../src/core/rng';
import { zoneDef } from '../src/data/zones';
import { rectsOverlap } from '../src/core/geom';
import { int } from '../src/core/rng';
const z = zoneDef(Number(process.argv[2] ?? 1));
const rng = createRng('dbg');
const rooms: {x:number,y:number,w:number,h:number}[] = [];
for (let attempt = 0; attempt < 500 && rooms.length < 10; attempt++) {
  const w = int(rng, z.roomW[0], z.roomW[1]);
  const h = int(rng, z.roomH[0], z.roomH[1]);
  const r = { x: int(rng, 3, z.w - w - 4), y: int(rng, 3, z.h - h - 4), w, h };
  if (rooms.some((o) => rectsOverlap(o, r, 3))) continue;
  rooms.push(r);
}
console.log(rooms.length, rooms);
void _internal;
