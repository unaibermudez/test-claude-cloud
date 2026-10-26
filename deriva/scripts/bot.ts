/**
 * Bot de balance: juega muchas partidas headless con varias estrategias y escribe docs/BALANCE.md.
 * Uso: npm run bot -- [partidas_por_estrategia=60] [--campaign N]
 */
import { writeFileSync } from 'node:fs';
import { createRun, defaultOptions } from '../src/core/game';
import { playRun, type Strategy, type BotResult } from '../src/sim/bot';
import { newMeta, snapshotFor, finishRun, buyUpgrade, upgradeState, classUnlocked } from '../src/core/meta';
import { UPGRADES } from '../src/data/upgrades';
import { CLASSES } from '../src/data/classes';

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 60);
const campaignIdx = args.indexOf('--campaign');
const CAMPAIGN = campaignIdx >= 0 ? Number(args[campaignIdx + 1] ?? 30) : 30;
const quiet = args.includes('--quiet');
const SEC_PER_TURN = 0.75;

const strategies: Strategy[] = ['agresivo', 'sigilo', 'prudente'];
const allPerks = UPGRADES.map((u) => u.id);

function summarize(rs: BotResult[]) {
  const n = rs.length;
  const wins = rs.filter((r) => r.victory).length;
  const stuck = rs.filter((r) => r.stuck).length;
  const avg = (f: (r: BotResult) => number) => rs.reduce((a, r) => a + f(r), 0) / Math.max(1, n);
  const deathZone: Record<string, number> = {};
  for (const r of rs) if (!r.victory) deathZone[`Z${r.zone}`] = (deathZone[`Z${r.zone}`] ?? 0) + 1;
  const causes: Record<string, number> = {};
  for (const r of rs) if (!r.victory) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
  const ft = rs.flatMap((r) => r.floorTurns);
  return {
    n, wins, winRate: wins / n, stuck, avgFloors: avg((r) => r.floorNo), avgTurns: avg((r) => r.turns), avgKills: avg((r) => r.kills),
    avgMin: avg((r) => r.turns) * SEC_PER_TURN / 60, avgFloorTurns: ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length), deathZone, causes,
    avgLogs: avg((r) => r.logs), avgScenes: avg((r) => r.scenes),
    winMin: rs.filter((r) => r.victory).reduce((a, r) => a + r.turns, 0) / Math.max(1, wins) * SEC_PER_TURN / 60,
  };
}

const lines: string[] = [];
const out = (s = '') => { lines.push(s); if (!quiet) console.log(s); };
const t0 = Date.now();

out('# DERIVA — Informe de balance');
out('');
out(`Generado por \`npm run bot\` (${new Date().toISOString().slice(0, 10)}). Duración estimada: ${SEC_PER_TURN} s por turno de juego humano.`);
out('');
out('## 1. Partidas aisladas (sin mejoras / todas las mejoras)');
out('');
out('| Configuración | Estrategia | Partidas | Victorias | Atascos | Pisos medios | Turnos medios | Min. estimados | Min. por victoria | Bajas | Turnos/piso | Muertes por zona | Causas |');
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [label, perks] of [['Sin mejoras', [] as string[]], ['Árbol completo', allPerks]] as const) {
  for (const s of strategies) {
    const rs: BotResult[] = [];
    for (let i = 0; i < N; i++) {
      const cls = CLASSES[i % 5].id;
      const st = createRun(defaultOptions({ seed: `bal-${label}-${s}-${i}`, classId: cls }), snapshotFor(newMeta()), perks);
      rs.push(playRun(st, s));
    }
    const S = summarize(rs);
    out(`| ${label} | ${s} | ${S.n} | ${S.wins} (${(S.winRate * 100).toFixed(0)} %) | ${S.stuck} | ${S.avgFloors.toFixed(1)} | ${S.avgTurns.toFixed(0)} | ${S.avgMin.toFixed(0)} | ${S.winMin.toFixed(0)} | ${S.avgKills.toFixed(1)} | ${S.avgFloorTurns.toFixed(0)} | ${Object.entries(S.deathZone).map(([k, v]) => `${k}:${v}`).join(' ')} | ${Object.entries(S.causes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}:${v}`).join(' ')} |`);
  }
}
out('');
out(`## 2. Campaña con meta-progresión (${CAMPAIGN} partidas seguidas, compra codiciosa de mejoras)`);
out('');
out('| Estrategia | Primera victoria (partida nº) | Victorias | Mejoras compradas | Memorias totales | Zona más profunda por tramo de 5 partidas | Finales vistos |');
out('|---|---|---|---|---|---|---|');
for (const s of strategies) {
  const meta = newMeta();
  let first = -1; let wins = 0;
  const depth: number[] = [];
  for (let i = 0; i < CAMPAIGN; i++) {
    const cls = CLASSES.filter((c) => classUnlocked(meta, c.id))[i % CLASSES.filter((c) => classUnlocked(meta, c.id)).length].id;
    const st = createRun(defaultOptions({ seed: `camp-${s}-${i}`, classId: cls }), snapshotFor(meta), meta.upgrades);
    const r = playRun(st, s);
    finishRun(meta, st);
    if (r.victory) { wins++; if (first < 0) first = i + 1; }
    depth.push(r.zone);
    // compra codiciosa: lo más barato disponible
    for (let k = 0; k < 10; k++) {
      const av = UPGRADES.filter((u) => upgradeState(meta, u.id) === 'available').sort((a, b) => a.cost - b.cost);
      if (!av.length) break;
      buyUpgrade(meta, av[0].id);
    }
  }
  const chunks: string[] = [];
  for (let i = 0; i < depth.length; i += 5) chunks.push(String(Math.max(...depth.slice(i, i + 5))));
  out(`| ${s} | ${first < 0 ? '—' : first} | ${wins} | ${meta.upgrades.length}/${UPGRADES.length} | ${meta.memoriasTotal} | ${chunks.join(' → ')} | ${meta.endings.join(', ') || '—'} |`);
}
out('');
out(`Tiempo de simulación: ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
if (!args.includes('--no-write')) writeFileSync('docs/BALANCE_DATOS.md', lines.join('\n') + '\n');
