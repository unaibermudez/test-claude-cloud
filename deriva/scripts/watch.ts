import { createRun, defaultOptions, emptyMeta, step } from '../src/core/game';
import { botDecide, newBotMemory, type Strategy } from '../src/sim/bot';
import { getPlayer } from '../src/core/actors';
import { TILE } from '../src/core/state';
import { getVision } from '../src/core/vision';
const seed = process.argv[2] ?? 'w1';
const strat = (process.argv[3] ?? 'prudente') as Strategy;
const maxSteps = Number(process.argv[4] ?? 3000);
const st = createRun(defaultOptions({ seed, classId: process.env.CLS ?? 'tecnico' }), emptyMeta(), []);
const mem = newBotMemory();
const ch: Record<number, string> = { 0: ' ', 1: '#', 2: '.', 3: '+', 4: 'o', 5: '=', 6: '"', 7: ',', 8: 'I', 9: '%', 10: 'X', 11: 'A', 12: ':', 13: 'H', 14: ';' };
function dump(): void {
  const m = st.map; const p = getPlayer(st); const v = getVision(st);
  const rows: string[] = [];
  for (let y = 0; y < m.h; y++) {
    let r = '';
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      let c = m.seen[i] ? ch[m.tiles[i]] : ' ';
      if (m.tiles[i] === TILE.DOOR) { const d = m.doors[i]; c = d.open ? "'" : d.lock ? d.lock[0].toUpperCase() : '+'; }
      const pr = m.props.find((q) => q.x === x && q.y === y);
      if (pr && m.seen[i]) c = ({ exit: '>', entry: '<', keycard: 'K', o2station: 'O', terminal: 'T', container: 'k', log: '?', npc: '@', event: '!', powernode: 'P' } as Record<string, string>)[pr.kind] ?? c;
      const a = st.actors.find((q) => !q.dead && q.x === x && q.y === y);
      if (a && (a.id === p.id || v.seenActors.has(a.id))) c = a.id === p.id ? '@' : a.phantom ? 'f' : 'e';
      r += c;
    }
    rows.push(r);
  }
  console.log(rows.join('\n'));
  console.log(`T${st.turn} Z${st.zone}-${st.map.floor} hp=${p.hp} o2=${st.player.o2.toFixed(0)} en=${st.player.energy.toFixed(0)} keys=${st.player.keys} modal=${st.modal?.kind} stuck=${mem.stuck}`);
}
let lastLog = '';
for (let i = 0; i < maxSteps && !st.over; i++) {
  const a = botDecide(st, strat, mem);
  const ev = step(st, a);
  const msgs = ev.filter((e) => e.t === 'msg').map((e) => (e as { key: string }).key).join(',');
  if (process.env.V && msgs && msgs !== lastLog) { console.log(i, JSON.stringify(a), msgs); lastLog = msgs; }
  if (i % 500 === 499) dump();
}
dump();
console.log(st.over);
