import { createRun, defaultOptions, emptyMeta, step } from '../src/core/game';
import { botDecide, newBotMemory } from '../src/sim/bot';
import { getPlayer } from '../src/core/actors';
import { pressureAt } from '../src/core/map';
for (let i = 0; i < 30; i++) {
  const st = createRun(defaultOptions({ seed: `q${i}`, classId: ['tecnico', 'infiltrado', 'medico', 'soldador', 'hacker'][i % 5] }), emptyMeta(), []);
  const mem = newBotMemory();
  let vacTurns = 0; let lowTurns = 0; let waits = 0; const startO2: number[] = [];
  let lastFloor = st.floorNo;
  for (let k = 0; k < 30000 && !st.over; k++) {
    const a = botDecide(st, 'prudente', mem);
    if (a.t === 'wait') waits++;
    step(st, a);
    const p = getPlayer(st);
    const pr = pressureAt(st.map, p.x, p.y);
    if (pr < 30) vacTurns++; else if (pr < 70) lowTurns++;
    if (st.floorNo !== lastFloor) { lastFloor = st.floorNo; startO2.push(Math.round(st.player.o2)); }
  }
  if (st.over?.cause === 'o2') console.log(`q${i} Z${st.zone}-${st.map.floor} T${st.turn} floorT${st.floorTurn} vac=${vacTurns} low=${lowTurns} waits=${waits} event=${st.map.event} o2AtFloorStart=${startO2} stations=${st.map.props.filter((q) => q.kind === 'o2station').map((q) => (q.used ? 'U' : 'o') + (st.map.seen[q.y * st.map.w + q.x] ? 's' : '-')).join('')} inv=${st.player.inv.map((s) => s.id).join(',')}`);
}
