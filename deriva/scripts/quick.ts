import { createRun, defaultOptions, emptyMeta } from '../src/core/game';
import { playRun, type Strategy } from '../src/sim/bot';
import { UPGRADES } from '../src/data/upgrades';
const n = Number(process.argv[2] ?? 20); const strat = (process.argv[3] ?? 'prudente') as Strategy; const full = process.argv[4] === 'full';
const perks = full ? UPGRADES.map((u) => u.id) : [];
const res: Record<string, number> = {}; const causes: Record<string, number> = {};
let wins = 0; let turns = 0; let stuck = 0; const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const st = createRun(defaultOptions({ seed: `q${i}`, classId: ['tecnico', 'infiltrado', 'medico', 'soldador', 'hacker'][i % 5] }), emptyMeta(), perks);
  const r = playRun(st, strat, 30000);
  const k = `${r.zone}-${r.floor}`; res[k] = (res[k] ?? 0) + 1; causes[r.cause] = (causes[r.cause] ?? 0) + 1;
  if (r.victory) wins++; if (r.stuck) stuck++; turns += r.turns; if (process.env.V) console.log(`q${i}`, r.cause, k, r.turns); if (process.env.V && r.stuck) console.log(r.tail.join('\n'));
}
console.log(JSON.stringify(Object.entries(res).sort()), '\n', JSON.stringify(Object.entries(causes).sort((a, b) => b[1] - a[1])), `\nwins=${wins} stuck=${stuck} avgTurns=${(turns / n).toFixed(0)} ${(Date.now() - t0) / 1000}s`);
