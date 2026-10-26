import { createRun, defaultOptions, emptyMeta, step } from '../src/core/game';
import { botDecide, newBotMemory, type Strategy } from '../src/sim/bot';
import { getPlayer } from '../src/core/actors';
const seed = process.argv[2]; const strat = (process.argv[3] ?? 'prudente') as Strategy; const n = Number(process.argv[4] ?? 12000);
const st = createRun(defaultOptions({ seed, classId: process.env.CLS ?? 'tecnico' }), emptyMeta(), []);
const mem = newBotMemory();
const log: string[] = [];
for (let i = 0; i < n && !st.over; i++) {
  const a = botDecide(st, strat, mem); const ev = step(st, a); const p = getPlayer(st);
  log.push(`${i} T${st.turn} (${p.x},${p.y}) ${JSON.stringify(a)} ${ev.filter((e) => e.t === 'msg').map((e) => (e as { key: string }).key).join(',')} modal=${st.modal?.kind ?? ''}`);
  if (log.length > 12) log.shift();
}
console.log(log.join('\n'));
