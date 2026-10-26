/** Mide cuántas veces gana el bot contra el jefe de cada zona con el equipo inicial de esa zona. */
import { createRun, defaultOptions, emptyMeta, debugWarp, step } from '../src/core/game';
import { botDecide, newBotMemory, type Strategy } from '../src/sim/bot';
import { getPlayer } from '../src/core/actors';
import type { ZoneId } from '../src/core/content';
import { UPGRADES } from '../src/data/upgrades';
import { enemyDef } from '../src/data/enemies';
const n = Number(process.argv[2] ?? 10);
const strat = (process.argv[3] ?? 'prudente') as Strategy;
const perks = process.argv[4] === 'full' ? UPGRADES.map((u) => u.id) : [];
const only = process.env.Z ? process.env.Z.split(',').map(Number) : null;
for (const z of [1, 2, 3, 4, 5, 6] as ZoneId[]) {
  if (only && !only.includes(z)) continue;
  let wins = 0; const hpLeft: number[] = []; const causes: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const st = createRun(defaultOptions({ seed: `boss${z}-${i}`, classId: ['tecnico', 'soldador', 'medico', 'infiltrado', 'hacker'][i % 5], startZone: (z === 6 ? 4 : z) as ZoneId }), emptyMeta(), perks);
    if (z === 6) st.player.suit = true;
    debugWarp(st, z, 4);
    const mem = newBotMemory();
    const floor0 = st.floorNo;
    for (let k = 0; k < 4000 && !st.over && st.floorNo === floor0; k++) step(st, botDecide(st, strat, mem));
    const p = getPlayer(st);
    const boss = st.actors.find((a) => a.boss && enemyDef(a.def).rank === 'boss');
    if (process.env.V) console.log(`  ${i}: turnos ${st.turn} · jefe ${boss ? `${boss.hp}/${boss.maxHp}` : 'muerto'} · ${st.over?.cause ?? 'vivo'} · daño hecho ${st.stats.damageDealt}`);
    if ((!st.over && st.floorNo !== floor0) || st.over?.victory) { wins++; hpLeft.push(p.hp / p.maxHp); }
    else if (st.over) causes[st.over.cause] = (causes[st.over.cause] ?? 0) + 1;
    else causes.timeout = (causes.timeout ?? 0) + 1;
  }
  console.log(`Z${z}: ${wins}/${n} victorias · vida media restante ${(hpLeft.reduce((a, b) => a + b, 0) / Math.max(1, hpLeft.length) * 100).toFixed(0)} % · ${JSON.stringify(causes)}`);
}
