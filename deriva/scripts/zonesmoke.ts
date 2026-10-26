/** Prueba de humo por zona: el bot empieza en cada zona con equipo de esa zona y juega unos pisos. */
import { createRun, defaultOptions, emptyMeta, debugWarp } from '../src/core/game';
import { playRun } from '../src/sim/bot';
import { UPGRADES } from '../src/data/upgrades';
import type { ZoneId } from '../src/core/content';
const perks = UPGRADES.map((u) => u.id);
const zones = (process.argv[2] ?? '2,3,4,5,6').split(',').map(Number) as ZoneId[];
const n = Number(process.argv[3] ?? 6);
for (const z of zones) {
  const res: string[] = [];
  for (let i = 0; i < n; i++) {
    const st = createRun(defaultOptions({ seed: `zs${z}-${i}`, classId: ['tecnico', 'soldador', 'hacker', 'medico', 'infiltrado'][i % 5], startZone: (z === 6 ? 4 : z) as ZoneId }), emptyMeta(), perks);
    if (z === 6) { st.player.suit = true; debugWarp(st, 6, 1); }
    const r = playRun(st, 'prudente', 20000);
    res.push(`${r.zone}-${r.floor}:${r.cause}`);
  }
  console.log(`Z${z}`, res.join(' '));
}
