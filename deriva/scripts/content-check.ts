/**
 * Comprobación de contenido (npm run content):
 *  - textos: paridad es/en, sin valores vacíos, toda clave usada en el código existe;
 *  - referencias: escenas, efectos, condiciones, botín, jefes, mejoras, clases;
 *  - alcanzabilidad: cada final tiene camino, cada registro aparece, los arcos de PNJ están encadenados;
 * Genera además `i18n/es.json` e `i18n/en.json` fusionados y `docs/CONTENIDO.md`.
 * Sale con código 1 si hay errores.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DICTS } from '../src/i18n';
import { ALL_ITEMS, hasItemDef, INJECTOR_LOOKS, MODULE_LOOKS } from '../src/data/items';
import { ENEMIES, hasEnemy, BESTIARY_IDS, ELITES } from '../src/data/enemies';
import { LOGS } from '../src/data/logs';
import { SCENES, MORAL_EVENT_IDS } from '../src/data/scenes';
import { ENDINGS, MAIN_ENDINGS, DEATH_ENDINGS } from '../src/data/endings';
import { CLASSES } from '../src/data/classes';
import { UPGRADES } from '../src/data/upgrades';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { ZONES } from '../src/data/zones';
import { RECIPES } from '../src/core/player';
import type { Cond, Effect, NpcId, ZoneId } from '../src/core/content';
import { createRun, defaultOptions, emptyMeta, debugWarp } from '../src/core/game';
import { DEFAULT_BINDS } from '../src/platform/settings';
import { THEMES } from '../src/audio/music';

const errors: string[] = [];
const warns: string[] = [];
const err = (s: string): void => { errors.push(s); };
const warn = (s: string): void => { warns.push(s); };

const ES = DICTS.es;
const EN = DICTS.en;

// ------------------------------------------------------------------ 1. paridad y vacíos
for (const k of Object.keys(ES)) if (!(k in EN)) err(`i18n: falta en en: ${k}`);
for (const k of Object.keys(EN)) if (!(k in ES)) err(`i18n: falta en es: ${k}`);
for (const [lang, d] of [['es', ES], ['en', EN]] as const) {
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== 'string') { err(`i18n ${lang}: ${k} no es texto`); continue; }
    if (!v.trim() && k !== 'npc.narrator.name' && !(k.endsWith('.lore') && !BESTIARY_IDS.includes(k.split('.')[1]))) err(`i18n ${lang}: ${k} vacío`);
    const braces = (v.match(/\{/g) ?? []).length - (v.match(/\}/g) ?? []).length;
    if (braces !== 0) err(`i18n ${lang}: llaves desequilibradas en ${k}`);
    for (const m of v.matchAll(/\{([^{}]*)\}/g)) {
      const inner = m[1];
      if (inner.includes('|') && inner.split('|').length !== 3) err(`i18n ${lang}: forma de género mal formada en ${k}: {${inner}}`);
    }
  }
}
// parámetros coherentes entre idiomas
for (const k of Object.keys(ES)) {
  if (!(k in EN)) continue;
  const ps = (s: string): string[] => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
  const a = ps(ES[k]).join(); const b = ps(EN[k]).join();
  if (a !== b) err(`i18n: parámetros distintos en ${k}: es[${a}] en[${b}]`);
}

const need = (k: string, where: string): void => {
  if (!(k in ES)) err(`i18n: falta la clave ${k} (${where})`);
  else if (!(k in EN)) err(`i18n: falta la clave en inglés ${k} (${where})`);
};

// ------------------------------------------------------------------ 2. claves literales usadas en el código
const PREFIX = /^(msg|ui|agora|tut|hub|sub|event|hallu|ending|fate|intro|zone|credits|npc|item|enemy|boss|elite|log|sc|class|branch|up|ach|mode|key|slot|unknown)\.[A-Za-z0-9_.]+$/;
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const DYNAMIC_OK = new Set(['msg.', 'ui.']);
for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/'([a-z]+\.[A-Za-z0-9_.]+)'/g)) {
    const k = m[1];
    if (!PREFIX.test(k) || k.endsWith('.') || DYNAMIC_OK.has(k)) continue;
    if (/\.(ts|json|css|png)$/.test(k)) continue;
    if (k.startsWith('up.req.') || k === 'zone.boss' || k === 'zone.floor') { need(k, file); continue; }
    need(k, file);
  }
}

// ------------------------------------------------------------------ 3. familias dinámicas
for (const d of ALL_ITEMS) { need(`item.${d.id}.name`, 'objeto'); need(`item.${d.id}.desc`, 'objeto'); }
INJECTOR_LOOKS.forEach((_, i) => need(`unknown.injector.${i}`, 'apariencia'));
MODULE_LOOKS.forEach((_, i) => need(`unknown.module.${i}`, 'apariencia'));
for (const e of ENEMIES) {
  need(`enemy.${e.id}.name`, 'enemigo');
  if (BESTIARY_IDS.includes(e.id)) { need(`enemy.${e.id}.desc`, 'bestiario'); need(`enemy.${e.id}.lore`, 'bestiario'); }
  if (e.boss) {
    need(e.boss.intro, `jefe ${e.id}`); need(e.boss.death, `jefe ${e.id}`);
    e.boss.phases.forEach((ph) => need(ph.msg, `fase ${e.id}`));
    for (const ph of e.boss.phases) for (const pt of ph.patterns) if (pt.summon && !hasEnemy(pt.summon)) err(`jefe ${e.id}: invoca desconocido ${pt.summon}`);
    for (const d of e.boss.drop ?? []) if (!hasItemDef(d)) err(`jefe ${e.id}: botín desconocido ${d}`);
    if (!THEMES[e.boss.music] && !e.boss.music.startsWith('boss')) err(`jefe ${e.id}: música ${e.boss.music} inexistente`);
  }
}
for (const el of ELITES) need(`elite.${el}`, 'élite');
for (const l of LOGS) { need(`log.${l.id}.title`, 'registro'); need(`log.${l.id}.author`, 'registro'); need(`log.${l.id}.body`, 'registro'); need(`log.kind.${l.kind}`, 'tipo de registro'); }
for (const c of CLASSES) {
  need(`class.${c.id}.name`, 'clase'); need(`class.${c.id}.desc`, 'clase');
  for (const s of c.start) if (!hasItemDef(s.item)) err(`clase ${c.id}: objeto inicial ${s.item}`);
  for (const i of c.implants ?? []) if (!hasItemDef(i)) err(`clase ${c.id}: implante ${i}`);
  if (c.unlock && !c.unlock.startsWith('flag:') && !UPGRADES.some((u) => u.id === c.unlock)) err(`clase ${c.id}: desbloqueo ${c.unlock}`);
}
const upIds = new Set(UPGRADES.map((u) => u.id));
for (const u of UPGRADES) {
  need(`up.${u.id}.name`, 'mejora'); need(`up.${u.id}.desc`, 'mejora'); need(`branch.${u.branch}`, 'rama');
  for (const r of u.req) {
    if (r.startsWith('flag:') || r.startsWith('arc:')) need(`up.req.${r.replace(/:/g, '.')}`, `requisito ${u.id}`);
    else if (!upIds.has(r)) err(`mejora ${u.id}: requisito desconocido ${r}`);
  }
  for (const s of u.start ?? []) if (!hasItemDef(s.item)) err(`mejora ${u.id}: objeto ${s.item}`);
  for (const i of u.unlockImplants ?? []) if (!hasItemDef(i)) err(`mejora ${u.id}: implante ${i}`);
}
for (const a of ACHIEVEMENTS) { need(`ach.${a.id}.name`, 'logro'); need(`ach.${a.id}.desc`, 'logro'); }
for (const e of ENDINGS) {
  need(`ending.${e.id}.title`, 'final'); need(`ending.${e.id}.body`, 'final'); need(`ui.ending.hint.${e.id}`, 'pista de final');
  if (!THEMES[e.music]) err(`final ${e.id}: música ${e.music} inexistente`);
}
for (const m of ['historia', 'dificil', 'diario', 'semilla', 'pesadilla']) { need(`mode.${m}.name`, 'modo'); need(`mode.${m}.desc`, 'modo'); }
for (const z of Object.values(ZONES)) {
  need(`zone.${z.id}`, 'zona');
  for (const id of [...z.minis, z.boss]) if (!hasEnemy(id)) err(`zona ${z.id}: enemigo ${id} inexistente`);
  for (const d of z.decor) need(`ui.decor.${d}`, 'decorado');
  if (!THEMES[z.music]) err(`zona ${z.id}: música ${z.music}`);
  for (const tier of ['hostile', 'wary', 'neutral', 'warm', 'close']) need(`agora.zone${z.id}.${tier}`, 'ÁGORA por zona');
}
for (const r of RECIPES) { if (!hasItemDef(r.out)) err(`receta ${r.id}: salida ${r.out}`); for (const [n] of r.needs) if (!hasItemDef(n)) err(`receta ${r.id}: ingrediente ${n}`); }
for (const cmd of Object.keys(DEFAULT_BINDS)) need(`ui.cmd.${cmd}`, 'control');
const UI_FAMILIES: Record<string, string[]> = {
  'ui.status': ['stun', 'slow', 'rooted', 'bleed', 'poison', 'blind', 'vulnerable', 'shielded', 'cloak', 'haste', 'regen', 'radshield', 'rage', 'scan'],
  'ui.event': ['gravedad', 'apagon', 'fuego', 'brecha', 'radiacion', 'ruido'],
  'event': ['gravedad', 'apagon', 'fuego', 'brecha', 'radiacion', 'ruido'],
  'ui.trait': ['knockback', 'pierce', 'fire', 'stun', 'emp', 'bleed', 'silent', 'loud', 'reach', 'chain', 'cone', 'aoe', 'harpoon', 'mental', 'light', 'heavy', 'fast', 'crush', 'lifesteal', 'freeze', 'breach'],
  'ui.type': ['weapon', 'consumable', 'gadget', 'implant', 'key', 'quest', 'part', 'ammo', 'suit', 'kit'],
  'ui.active': ['cloak', 'overclock', 'pulse', 'shield', 'blink', 'scan', 'heal'],
  'ui.ammo': ['balas', 'cartuchos', 'clavos', 'virotes'],
  'ui.ai': ['idle', 'patrol', 'alert', 'hunt', 'flee', 'dormant', 'guard'],
  'ui.prop': ['terminal', 'o2station', 'powernode', 'vending', 'merchant', 'workbench', 'autosurgeon', 'bed', 'cryopod', 'barrel', 'cable', 'container', 'exit', 'entry', 'airlockPanel', 'vent', 'log', 'npc', 'event', 'camera', 'emlight', 'decor', 'keycard', 'hullExit', 'core', 'corpse', 'radio'],
  'ui.tile': Array.from({ length: 15 }, (_, i) => String(i)),
  'ui.stab': ['0', '1', '2', '3'],
  'ui.term.op': ['hack', 'skip', 'boss_shield', 'open_circuits', 'map', 'seal_near', 'turrets', 'drones', 'cameras', 'ventilation', 'cables', 'lights'],
  'ui.hack.reward': ['energy', 'map', 'scrap', 'main'],
  'ui.mod': ['maxHp', 'maxO2', 'maxEnergy', 'o2Mult', 'energyMult', 'sight', 'nightVision', 'armor', 'evasion', 'acc', 'melee', 'ranged', 'moveCost', 'noiseMult', 'hack', 'radResist', 'fireResist', 'mentalMult', 'magboots', 'regen', 'energyRegen', 'crit', 'healMult', 'light', 'scrapMult', 'seeHidden', 'noisePerTurn', 'migraine', 'stealthKill', 'vacuum', 'pushPower', 'shield', 'thermal', 'sense'],
  'ui.cause': ['bleed', 'debris', 'poison', 'radiation', 'spores', 'collapse', 'o2', 'explosion', 'fire', 'shock', 'orbit', 'dissolution', 'eject', 'abandon', 'unknown', 'hit', 'vent', 'push', 'env'],
  'ui.rules': Array.from({ length: 12 }, (_, i) => String(i + 1)),
  'ui.agora.tier': ['hostile', 'wary', 'neutral', 'warm', 'close'],
  'agora.trust': ['hostile', 'wary', 'neutral', 'warm', 'close'],
  'ui.tree.state': ['owned', 'available', 'locked', 'expensive'],
  'ui.opt.tab': ['audio', 'access', 'game', 'controls', 'data'],
  'ui.opt.cb': ['none', 'deuter', 'protan', 'tritan'],
  'ui.opt.size': ['s', 'm', 'l', 'xl'],
  'ui.pronoun': ['el', 'ella', 'elle'],
  'ui.dir': ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
  'ui.rank': ['mini', 'boss'],
  'ui.help': ['controls', 'rules', 'legend'],
  'key': ['amber', 'cyan', 'violet', 'circuit', 'boss'],
  'slot': ['brain', 'eyes', 'torso', 'arms', 'legs'],
  'agora.death': ['1', '2', '3', '4', '5', '6', '7', '8'],
  'intro': ['1', '2', '3', '4', '5', '6', 'agora', 'skip'],
};
for (const [pre, list] of Object.entries(UI_FAMILIES)) for (const x of list) need(`${pre}.${x}`, `familia ${pre}`);
for (const k of ['subtitles', 'highContrast', 'reduceFlicker', 'reduceShake', 'reduceGlitch', 'crt', 'showTutorial', 'generousO2', 'assistHack', 'skipHack', 'dullEnemies', 'longOrbit']) { need(`ui.opt.${k}`, 'opción'); need(`ui.opt.${k}.desc`, 'opción'); }
for (const s of [2, 3, 4]) for (const n of [1, 2, 3]) need(`ui.radio.s${s}.${n}`, 'radio');
for (const npc of ['celia', 'tomas', 'bruno', 'solis', 'lenz', 'faro']) { need(`npc.${npc}.name`, 'PNJ'); need(`npc.${npc}.role`, 'PNJ'); need(`npc.${npc}.bio`, 'PNJ'); }
for (const tut of ['start', 'dark', 'o2', 'terminal', 'door', 'enemy', 'key', 'item', 'log', 'vacuum', 'hallu', 'npc']) { need(`tut.${tut}`, 'tutorial'); need(`tut.${tut}.title`, 'tutorial'); }

// ------------------------------------------------------------------ 4. escenas: referencias y textos
const sceneIds = new Set(SCENES.map((s) => s.id));
for (const file of walk('src')) {
  for (const m of readFileSync(file, 'utf8').matchAll(/startScene\(st, ev, '([a-zA-Z0-9_]+)'/g)) if (!sceneIds.has(m[1])) err(`${file}: escena ${m[1]} inexistente`);
}
const flagsSet = new Set<string>();
const metaSet = new Set<string>();
const itemsGiven = new Set<string>();
const stagesSet: Record<string, Set<number>> = {};
function scanEffects(fx: Effect[] | undefined, where: string): void {
  for (const e of fx ?? []) {
    if ('flag' in e) flagsSet.add(e.flag);
    if ('meta' in e) metaSet.add(e.meta);
    if ('give' in e) { itemsGiven.add(e.give); if (!hasItemDef(e.give)) err(`${where}: give ${e.give} inexistente`); }
    if ('take' in e && !hasItemDef(e.take)) err(`${where}: take ${e.take} inexistente`);
    if ('implant' in e && !hasItemDef(e.implant)) err(`${where}: implante ${e.implant} inexistente`);
    if ('spawn' in e && !hasEnemy(e.spawn)) err(`${where}: spawn ${e.spawn} inexistente`);
    if ('killNear' in e && e.killNear !== 'all' && !hasEnemy(e.killNear)) err(`${where}: killNear ${e.killNear} inexistente`);
    if ('log' in e && !LOGS.some((l) => l.id === e.log)) err(`${where}: registro ${e.log} inexistente`);
    if ('ending' in e && !ENDINGS.some((x) => x.id === e.ending)) err(`${where}: final ${e.ending} inexistente`);
    if ('arc' in e) (stagesSet[e.arc] ??= new Set()).add(e.stage);
    if ('fate' in e) need(`fate.${e.fate}.${e.v}`, where);
    if ('msg' in e) need(e.msg, where);
  }
}
function scanCond(c: Cond | undefined, where: string): void {
  if (!c) return;
  if ('has' in c && !hasItemDef(c.has)) err(`${where}: condición has ${c.has} inexistente`);
  if ('all' in c) c.all.forEach((x) => scanCond(x, where));
  if ('any' in c) c.any.forEach((x) => scanCond(x, where));
  if ('not' in c) scanCond(c.not, where);
}
for (const s of SCENES) {
  need(s.title, `escena ${s.id}`);
  if (!s.nodes[s.start]) err(`escena ${s.id}: nodo inicial ${s.start} no existe`);
  scanCond(s.cond, `escena ${s.id}`);
  if (s.setsStage && s.npc) (stagesSet[s.npc] ??= new Set()).add(s.setsStage);
  const reach = new Set<string>([s.start]);
  const queue = [s.start];
  while (queue.length) {
    const nid = queue.pop()!;
    const n = s.nodes[nid];
    if (!n) continue;
    const nexts = [n.next, ...(n.options ?? []).map((o) => o.next)].filter((x): x is string => !!x);
    for (const nx of nexts) {
      if (!s.nodes[nx]) err(`escena ${s.id}: nodo ${nid} apunta a ${nx} inexistente`);
      else if (!reach.has(nx)) { reach.add(nx); queue.push(nx); }
    }
  }
  for (const [nid, n] of Object.entries(s.nodes)) {
    need(n.text, `escena ${s.id}`);
    if (!reach.has(nid)) warn(`escena ${s.id}: nodo ${nid} inalcanzable`);
    scanEffects(n.effects, `escena ${s.id}.${nid}`);
    for (const o of n.options ?? []) { need(o.text, `escena ${s.id}`); scanEffects(o.effects, `escena ${s.id}.${nid}`); scanCond(o.cond, `escena ${s.id}.${nid}`); }
    if (n.speaker !== 'narrator' && n.speaker !== 'player') need(`npc.${n.speaker}.name`, `hablante en ${s.id}`);
  }
}

// ------------------------------------------------------------------ 5. arcos de PNJ encadenados
const NPCS: NpcId[] = ['celia', 'tomas', 'bruno', 'solis', 'lenz', 'faro'];
const arcReport: string[] = [];
for (const npc of NPCS) {
  const scenes = SCENES.filter((s) => s.npc === npc);
  const stages = [...new Set(scenes.map((s) => s.stage ?? 0))].sort();
  if (scenes.length < 3) err(`PNJ ${npc}: solo ${scenes.length} escenas (mínimo 3)`);
  // cada etapa con escena debe ser alcanzable: 0, o alguna escena/efecto la establece
  for (const st of stages) {
    if (st === 0) continue;
    if (!stagesSet[npc]?.has(st)) err(`PNJ ${npc}: ninguna escena lleva a la etapa ${st}`);
  }
  if (!stages.includes(0)) err(`PNJ ${npc}: no hay escena inicial (etapa 0)`);
  arcReport.push(`| ${npc} | ${scenes.length} | ${stages.join(', ')} | ${[...(stagesSet[npc] ?? [])].sort().join(', ')} |`);
}

// ------------------------------------------------------------------ 6. finales alcanzables
const core = SCENES.find((s) => s.id === 'core');
const endingsInCore = new Set<string>();
for (const n of Object.values(core?.nodes ?? {})) for (const o of n.options ?? []) for (const e of o.effects ?? []) if ('ending' in e) endingsInCore.add(e.ending);
for (const e of MAIN_ENDINGS) if (!endingsInCore.has(e)) err(`final ${e}: no se puede elegir en el Núcleo`);
// condiciones de los finales: las banderas deben poder activarse
for (const e of ENEMIES) { if (e.boss?.flag) flagsSet.add(e.boss.flag); for (const d of e.boss?.drop ?? []) itemsGiven.add(d); }
const flagSources = new Set<string>([...flagsSet, 'truth_known', 'truth_hint', 'boss_final', 'hull_done']);
const metaSources = new Set<string>([...metaSet, ...flagSources, 'olvido_seen', 'truth_seen']);
function condFlagsOk(c: Cond | undefined, where: string): void {
  if (!c) return;
  if ('flag' in c && !flagSources.has(c.flag)) err(`${where}: la bandera ${c.flag} nunca se activa`);
  if ('meta' in c && !metaSources.has(c.meta)) err(`${where}: la bandera meta ${c.meta} nunca se activa`);
  if ('has' in c && !itemsGiven.has(c.has) && !ALL_ITEMS.some((d) => d.id === c.has && d.tier > 0)) err(`${where}: el objeto ${c.has} nunca se consigue`);
  if ('logsGte' in c && c.logsGte > LOGS.length) err(`${where}: pide ${c.logsGte} registros y solo hay ${LOGS.length}`);
  if ('all' in c) c.all.forEach((x) => condFlagsOk(x, where));
  if ('any' in c) c.any.forEach((x) => condFlagsOk(x, where));
}
for (const e of ENDINGS) condFlagsOk(e.cond, `final ${e.id}`);
for (const s of SCENES) { condFlagsOk(s.cond, `escena ${s.id}`); for (const n of Object.values(s.nodes)) for (const o of n.options ?? []) condFlagsOk(o.cond, `escena ${s.id}`); }
const gameSrc = readFileSync('src/core/game.ts', 'utf8');
for (const d of DEATH_ENDINGS) if (!gameSrc.includes(`'${d}'`)) err(`final de muerte ${d}: deathCause no lo produce`);

// ------------------------------------------------------------------ 7. registros encontrables (simulación)
const found = new Set<string>();
const meta = emptyMeta();
meta.deaths = 6;
meta.arcs.lenz = 3;
for (let run = 0; run < 40 && found.size < LOGS.length; run++) {
  meta.logs = [...found];
  const st = createRun(defaultOptions({ seed: `logs${run}` }), JSON.parse(JSON.stringify(meta)), []);
  st.narrative.trust = 60;
  const visit = (): void => { for (const p of st.map.props) if (p.kind === 'log' && p.log) found.add(p.log); };
  visit();
  for (const z of [1, 2, 3, 4, 5, 6] as ZoneId[]) for (const f of [1, 2, 3]) { if (z === 1 && f === 1) continue; debugWarp(st, z, f); visit(); }
}
for (const l of LOGS) if (!found.has(l.id)) err(`registro ${l.id} (zona ${l.zone}) no aparece en 40 partidas simuladas`);

// ------------------------------------------------------------------ 8. recuento mínimo de contenido
const weapons = ALL_ITEMS.filter((d) => d.type === 'weapon').length;
const implants = ALL_ITEMS.filter((d) => d.type === 'implant').length;
const regulars = ENEMIES.filter((e) => !e.rank && e.threat > 0);
const counts: [string, number, number][] = [
  ['armas', weapons, 25], ['implantes', implants, 40], ['registros', LOGS.length, 60], ['eventos morales', MORAL_EVENT_IDS.length, 30],
  ['mejoras', UPGRADES.length, 50], ['clases', CLASSES.length, 5], ['logros', ACHIEVEMENTS.length, 40], ['finales principales', MAIN_ENDINGS.length, 6],
  ['finales de muerte', DEATH_ENDINGS.length, 3], ['PNJ con arco', NPCS.length, 6],
];
for (const [k, v, min] of counts) if (v < min) err(`contenido: ${k} = ${v} (< ${min})`);
for (const z of [1, 2, 3, 4, 5, 6] as ZoneId[]) {
  const n = regulars.filter((e) => e.zone === z).length;
  if (n < 8) err(`zona ${z}: solo ${n} enemigos únicos`);
  const minis = ENEMIES.filter((e) => e.zone === z && e.rank === 'mini').length;
  if (minis < 2) err(`zona ${z}: ${minis} minijefes`);
  const boss = ENEMIES.find((e) => e.id === ZONES[z].boss);
  if (!boss || (boss.boss?.phases.length ?? 0) < 2) err(`zona ${z}: el jefe no tiene varias fases`);
}
for (const npc of NPCS) {
  const n = SCENES.filter((s) => s.npc === npc).length;
  if (n < 3 || n > 6) warn(`PNJ ${npc}: ${n} escenas`);
}

// ------------------------------------------------------------------ salida
mkdirSync('i18n', { recursive: true });
const sortObj = (d: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(d).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('i18n/es.json', JSON.stringify(sortObj(ES), null, 1) + '\n');
writeFileSync('i18n/en.json', JSON.stringify(sortObj(EN), null, 1) + '\n');
const zoneRows = ([1, 2, 3, 4, 5, 6] as ZoneId[]).map((z) => {
  const regs = regulars.filter((e) => e.zone === z).length;
  const minis = ENEMIES.filter((e) => e.zone === z && e.rank === 'mini').map((e) => e.id).join(', ');
  return `| ${z} | ${ES[`zone.${z}`]} | ${regs} | ${minis} | ${ZONES[z].boss} (${ENEMIES.find((e) => e.id === ZONES[z].boss)?.boss?.phases.length} fases) | ${LOGS.filter((l) => l.zone === z).length} |`;
});
const md = `# Contenido de DERIVA (generado por \`npm run content\`)

Este documento se regenera automáticamente. No editar a mano.

## Recuento

| Elemento | Cantidad | Mínimo pedido |
|---|---:|---:|
${counts.map(([k, v, min]) => `| ${k} | ${v} | ${min} |`).join('\n')}
| enemigos regulares | ${regulars.length} | 48 |
| entradas de bestiario | ${BESTIARY_IDS.length} | — |
| escenas narrativas | ${SCENES.length} | — |
| objetos en total | ${ALL_ITEMS.length} | — |
| claves de texto (por idioma) | ${Object.keys(ES).length} | — |

## Zonas

| Zona | Nombre | Enemigos únicos | Minijefes | Jefe | Registros |
|---|---|---:|---|---|---:|
${zoneRows.join('\n')}

## Arcos de PNJ

| PNJ | Escenas | Etapas con escena | Etapas alcanzables |
|---|---:|---|---|
${arcReport.join('\n')}

## Finales

${ENDINGS.map((e) => `- **${ES[`ending.${e.id}.title`]}** (\`${e.id}\`, ${e.kind}) — ${e.memorias} Memorias`).join('\n')}

## Resultado de la comprobación

- Errores: ${errors.length}
- Avisos: ${warns.length}
${warns.map((w) => `  - ${w}`).join('\n')}
`;
writeFileSync('docs/CONTENIDO.md', md);

for (const w of warns) console.warn(`AVISO  ${w}`);
for (const e of errors) console.error(`ERROR  ${e}`);
console.log(`content-check: ${errors.length} errores, ${warns.length} avisos · ${Object.keys(ES).length} claves por idioma · ${found.size}/${LOGS.length} registros encontrados en simulación`);
if (errors.length) process.exit(1);
