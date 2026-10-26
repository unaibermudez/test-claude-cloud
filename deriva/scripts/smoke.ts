import { createRun, defaultOptions, emptyMeta, step } from '../src/core/game';
import { getPlayer } from '../src/core/actors';
import { DIRS } from '../src/core/geom';
const st = createRun(defaultOptions({ seed: process.argv[2] ?? 'smoke' }), emptyMeta(), []);
let msgs = 0;
for (let i = 0; i < 2000 && !st.over; i++) {
  if (st.modal) { step(st, st.modal.kind === 'dialog' ? { t: 'choice', index: 0 } : { t: 'closeModal' }); continue; }
  const ev = step(st, { t: 'move', dir: Math.floor(Math.random() * 8) });
  msgs += ev.filter((e) => e.t === 'msg').length;
  if (i % 50 === 0) step(st, { t: 'interact' });
}
const p = getPlayer(st);
console.log({ turn: st.turn, zone: st.zone, floor: st.map.floor, hp: p.hp, o2: st.player.o2.toFixed(1), over: st.over, msgs, kills: st.stats.kills, actors: st.actors.length });
void DIRS;
