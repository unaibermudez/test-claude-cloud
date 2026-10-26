/** Paneles de La Cápsula: árbol de mejoras, bestiario, finales, estadísticas, logros, taquilla y nueva partida. */
import { App, PANELS } from '../app/app';
import { h, clear, Nav, panelShell, scrollBody, KEY, type Panel } from './dom';
import { t, tOpt } from '../i18n';
import { UPGRADES, upgradeDef } from '../data/upgrades';
import { ENDINGS, MAIN_ENDINGS, DEATH_ENDINGS } from '../data/endings';
import { ACHIEVEMENTS } from '../data/achievements';
import { BESTIARY_IDS, enemyDef } from '../data/enemies';
import { CLASSES } from '../data/classes';
import { upgradeState, missingReqs, buyUpgrade, classUnlocked, startZones, modeUnlocked } from '../core/meta';
import { modsView } from './itemview';
import { spriteFor } from '../render/sprites';
import { dailySeed } from '../core/rng';
import type { GameMode } from '../core/state';
import type { UpgradeBranch } from '../core/content';
import type { CommandEvent } from '../input/input';

const close = (e: CommandEvent): boolean => e.cmd === 'cancel' || e.cmd === 'pause';
const BRANCHES: UpgradeBranch[] = ['supervivencia', 'tecnica', 'sigilo', 'memoria', 'acceso', 'laboratorio'];

function reqText(r: string): string {
  if (r.startsWith('flag:') || r.startsWith('arc:')) return tOpt(`up.req.${r.replace(/:/g, '.')}`) || r;
  return t(`up.${r}.name`);
}

// ------------------------------------------------------------------ árbol

PANELS.tree = (app: App): Panel => {
  const meta = app.meta;
  const shell = panelShell(t('hub.tree'), { cls: 'wide', onClose: () => app.pop(p) });
  let b = 0; let k = 0;
  const cols = BRANCHES.map((br) => UPGRADES.filter((u) => u.branch === br).sort((x, y) => x.pos[1] - y.pos[1] || x.pos[0] - y.pos[0]));
  const detail = h('div', { class: 'detail', style: 'margin-top:10px;min-height:110px' });
  const render = (): void => {
    clear(shell.body);
    const tree = h('div', { class: 'tree' });
    cols.forEach((nodes, bi) => {
      const col = h('div', { class: 'branch' }, h('h3', {}, t(`branch.${BRANCHES[bi]}`)));
      nodes.forEach((u, ni) => {
        const s = upgradeState(meta, u.id);
        const btn = h('button', { class: `node ${s}${bi === b && ni === k ? ' sel' : ''}`, style: `margin-left:${u.pos[0] * 10}px`, onclick: () => { b = bi; k = ni; buy(); } },
          s === 'owned' ? '✓ ' : '', t(`up.${u.id}.name`), s !== 'owned' ? h('span', { class: 'c' }, String(u.cost)) : null);
        btn.addEventListener('mouseenter', () => { b = bi; k = ni; showDetail(); mark(); });
        col.append(btn);
      });
      tree.append(col);
    });
    shell.body.append(h('p', {}, h('span', { class: 'progress' }, t('hub.memorias', { n: meta.memorias })), ' · ', h('span', { class: 'dim' }, t('ui.tree.count', { n: meta.upgrades.length, max: UPGRADES.length }))), tree, detail);
    showDetail();
  };
  const mark = (): void => {
    const all = shell.body.querySelectorAll('.node');
    let idx = 0;
    cols.forEach((nodes, bi) => nodes.forEach((_, ni) => { all[idx++]?.classList.toggle('sel', bi === b && ni === k); }));
    shell.body.querySelector('.node.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const showDetail = (): void => {
    clear(detail);
    const u = cols[b][k];
    if (!u) return;
    const s = upgradeState(meta, u.id);
    detail.append(h('div', { class: 'title' }, t(`up.${u.id}.name`), h('span', { class: 'dim' }, `· ${u.cost} ${t('ui.memorias')}`)), h('p', {}, t(`up.${u.id}.desc`)));
    if (u.mods) detail.append(modsView(u.mods));
    const miss = missingReqs(meta, u.id);
    if (miss.length) detail.append(h('p', { class: 'warn' }, `${t('ui.tree.requires')}: ${miss.map(reqText).join(', ')}`));
    detail.append(h('p', { class: s === 'owned' ? 'good' : s === 'available' ? 'info' : 'dim' }, t(`ui.tree.state.${s}`)));
  };
  const buy = (): void => {
    const u = cols[b][k];
    if (u && buyUpgrade(meta, u.id)) {
      app.saveMeta();
      app.audio.play('achievement');
      app.checkMetaAchievements();
      if (u.unlockClass) app.toast(t('ui.tree.unlocked'), t(`class.${u.unlockClass}.name`));
    } else app.audio.play('jam');
    render();
  };
  render();
  shell.footer.append(app.hints([[KEY.lr, t('ui.k.branch')], [KEY.arrows, t('ui.k.select')], [KEY.enter(), t('ui.k.buy_up')], [KEY.esc(), t('ui.k.close')]]));
  const p: Panel = {
    el: shell.root,
    onCommand: (e) => {
      if (close(e)) { app.pop(p); return true; }
      if (e.code === 'Home') { k = 0; mark(); showDetail(); return true; }
      if (e.code === 'End') { k = cols[b].length - 1; mark(); showDetail(); return true; }
      if (e.cmd === 'left') { b = (b + 5) % 6; k = Math.min(k, cols[b].length - 1); }
      else if (e.cmd === 'right') { b = (b + 1) % 6; k = Math.min(k, cols[b].length - 1); }
      else if (e.cmd === 'up') k = (k + cols[b].length - 1) % cols[b].length;
      else if (e.cmd === 'down') k = (k + 1) % cols[b].length;
      else if (e.cmd === 'confirm' || e.cmd === 'interact') { buy(); return true; }
      else return true;
      mark(); showDetail();
      return true;
    },
  };
  return p;
};

// ------------------------------------------------------------------ bestiario

PANELS.bestiary = (app: App): Panel => {
  const meta = app.meta;
  const known = BESTIARY_IDS.filter((id) => meta.bestiary[id]).length;
  const shell = panelShell(`${t('hub.bestiary')} · ${known}/${BESTIARY_IDS.length}`, { cls: 'wide', onClose: () => app.pop(p) });
  const cards = h('div', { class: 'cards' });
  const nav = new Nav();
  nav.cols = 'auto';
  const btns: HTMLElement[] = [];
  for (const id of BESTIARY_IDS) {
    const e = meta.bestiary[id];
    const d = enemyDef(id);
    const card = h('button', { class: `card${e ? '' : ' off'}` });
    if (e) {
      const spr = spriteFor(d.id, d.sprite);
      const cv = document.createElement('canvas');
      cv.width = 16; cv.height = 16;
      cv.getContext('2d')!.drawImage(spr.frames[0], 0, 0);
      card.append(cv, h('div', { class: 'ct' }, t(`enemy.${id}.name`)), h('div', { class: 'faint' }, `${t(`zone.${d.zone}`)}${d.rank ? ` · ${t(`ui.rank.${d.rank}`)}` : ''}`),
        h('div', { class: 'dim' }, t('ui.best.counts', { s: e.seen, k: e.kills })), h('p', {}, t(`enemy.${id}.desc`)),
        e.kills > 0 ? h('p', { class: 'lore' }, t(`enemy.${id}.lore`)) : h('p', { class: 'faint' }, t('ui.best.lore_locked')));
    } else card.append(h('div', { class: 'ct' }, '???'), h('div', { class: 'faint' }, t(`zone.${d.zone}`)));
    btns.push(card);
    cards.append(card);
  }
  shell.body.append(cards);
  nav.set(btns);
  shell.footer.append(app.hints([[[KEY.arrows, KEY.lr], t('ui.k.select')], [KEY.esc(), t('ui.k.close')]]));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (close(e)) { app.pop(p); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ finales

PANELS.endings = (app: App): Panel => {
  const meta = app.meta;
  const got = meta.endings;
  const shell = panelShell(`${t('hub.endings')} · ${got.length}/${ENDINGS.length}`, { cls: 'wide', onClose: () => app.pop(p) });
  const nav = new Nav();
  const btns: HTMLElement[] = [];
  const section = (title: string, ids: string[]): HTMLElement => {
    const wrap = h('div', { class: 'cards', style: 'margin-bottom:12px' });
    for (const id of ids) {
      const has = got.includes(id);
      const c = h('button', { class: `card${has ? ' on' : ' off'}` },
        h('div', { class: 'ct' }, has ? t(`ending.${id}.title`) : '???'),
        h('p', { class: has ? '' : 'faint' }, has ? `${t(`ending.${id}.body`).slice(0, 180)}…` : t(`ui.ending.hint.${id}`)));
      btns.push(c);
      wrap.append(c);
    }
    return h('div', {}, h('h3', { style: 'margin-bottom:6px' }, title), wrap);
  };
  shell.body.append(section(t('ui.ending.main'), MAIN_ENDINGS), section(t('ui.ending.death'), DEATH_ENDINGS));
  nav.cols = 'auto';
  nav.set(btns);
  shell.footer.append(app.hints([[[KEY.arrows, KEY.lr], t('ui.k.select')], [KEY.esc(), t('ui.k.close')]]));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (close(e)) { app.pop(p); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ estadísticas

PANELS.stats = (app: App): Panel => {
  const m = app.meta;
  const s = m.stats;
  const shell = panelShell(t('hub.stats'), { cls: 'wide', onClose: () => app.pop(p) });
  const stat = (k: string, v: string | number): HTMLElement => h('div', {}, h('span', { class: 'k' }, t(k)), String(v));
  const hours = Math.floor(s.playMs / 3600000); const mins = Math.floor((s.playMs % 3600000) / 60000);
  shell.body.append(h('div', { class: 'summary' },
    stat('ui.stats.runs', s.runs), stat('ui.stats.deaths', s.deaths), stat('ui.stats.victories', s.victories),
    stat('ui.stats.kills', s.kills), stat('ui.stats.floors', s.floors), stat('ui.stats.best', s.bestFloor),
    stat('ui.stats.deepest', s.deepestZone ? t(`zone.${s.deepestZone}`) : '—'), stat('ui.stats.bosses', s.bosses), stat('ui.stats.hacks', s.hacks),
    stat('ui.stats.vented', s.vented), stat('ui.stats.stealth', s.stealthKills), stat('ui.stats.scrap', s.scrap),
    stat('ui.stats.memorias', m.memoriasTotal), stat('ui.stats.logs', `${m.logs.length}/66`), stat('ui.stats.time', `${hours}h ${mins}m`),
    stat('ui.stats.achievements', `${Object.keys(m.achievements).length}/${ACHIEVEMENTS.length}`),
  ));
  shell.body.append(h('h3', { style: 'margin-top:10px' }, t('ui.stats.history')));
  if (!m.history.length) shell.body.append(h('p', { class: 'dim' }, t('ui.stats.no_history')));
  const list = h('div', { class: 'list' });
  for (const r of m.history) {
    list.append(h('div', { class: 'item' }, h('span', { class: 'grow' }, `#${r.run} · ${t(`class.${r.classId}.name`)} · ${t(`mode.${r.mode}.name`)} · ${t(`zone.${r.zone}`)} ${r.floor}`),
      h('span', { class: `r ${r.victory ? 'good' : 'danger'}` }, r.ending ? t(`ending.${r.ending}.title`) : r.victory ? '✓' : '✝'), h('span', { class: 'r' }, ` ${r.score} · +${r.memorias}`)));
  }
  shell.body.append(list);
  shell.footer.append(app.hints([[KEY.arrows, t('ui.k.scroll')], [KEY.esc(), t('ui.k.close')]]));
  const dailies = Object.entries(m.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  if (dailies.length) {
    shell.body.append(h('h3', { style: 'margin-top:10px' }, t('mode.diario.name')));
    for (const [k, v] of dailies) shell.body.append(h('div', { class: 'dim' }, `${k}: ${v.score} · ${t('ui.depth', { n: v.floor })}${v.ending ? ` · ${t(`ending.${v.ending}.title`)}` : ''}`));
  }
  const p: Panel = { el: shell.root, onCommand: (e) => { if (close(e)) { app.pop(p); return true; } scrollBody(shell.body, e); return true; } };
  return p;
};

// ------------------------------------------------------------------ logros

PANELS.achievements = (app: App): Panel => {
  const m = app.meta;
  const n = Object.keys(m.achievements).length;
  const shell = panelShell(`${t('hub.achievements')} · ${n}/${ACHIEVEMENTS.length}`, { cls: 'wide', onClose: () => app.pop(p) });
  const cards = h('div', { class: 'cards' });
  for (const a of ACHIEVEMENTS) {
    const has = !!m.achievements[a.id];
    const hide = a.secret && !has;
    cards.append(h('div', { class: `card${has ? ' on' : ' off'}` }, h('div', { class: 'ct' }, `${has ? '★' : '☆'} ${hide ? t('ui.ach.secret') : t(`ach.${a.id}.name`)}`), h('p', {}, hide ? t('ui.ach.secret_desc') : t(`ach.${a.id}.desc`))));
  }
  shell.body.append(cards);
  shell.footer.append(app.hints([[KEY.arrows, t('ui.k.scroll')], [KEY.esc(), t('ui.k.close')]]));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (close(e)) { app.pop(p); return true; } scrollBody(shell.body, e); return true; } };
  return p;
};

// ------------------------------------------------------------------ taquilla (clases)

PANELS.wardrobe = (app: App): Panel => {
  const m = app.meta;
  const shell = panelShell(t('hub.wardrobe'), { cls: 'wide', onClose: () => app.pop(p) });
  const nav = new Nav();
  nav.cols = 'auto';
  const render = (): void => {
    clear(shell.body);
    const cards = h('div', { class: 'cards' });
    const btns: HTMLElement[] = [];
    for (const c of CLASSES) {
      const ok = classUnlocked(m, c.id);
      const on = m.profile.lastClass === c.id;
      const start = c.start.map((s) => `${t(`item.${s.item}.name`)}${(s.n ?? 1) > 1 ? ` ×${s.n}` : ''}`).join(', ');
      const card = h('button', { class: `card${on ? ' on' : ''}${ok ? '' : ' off'}`, onclick: () => { if (ok) { m.profile.lastClass = c.id; app.saveMeta(); render(); } } },
        h('div', { class: 'ct' }, `${on ? '▸ ' : ''}${t(`class.${c.id}.name`)}`),
        h('p', {}, t(`class.${c.id}.desc`)),
        h('div', { class: 'dim' }, `${t('ui.hp')} ${c.hp} · ${t('ui.o2')} ${c.o2} · ${t('ui.energy')} ${c.energy}`),
        h('div', { class: 'faint' }, start),
        modsView(c.mods),
        ok ? null : h('p', { class: 'warn' }, `${t('class.locked')}: ${reqText(c.unlock ?? '')}`));
      btns.push(card);
      cards.append(card);
    }
    shell.body.append(cards);
    nav.set(btns);
  };
  render();
  shell.footer.append(app.hints([[[KEY.arrows, KEY.lr], t('ui.k.select')], [KEY.enter(), t('ui.k.ok')], [KEY.esc(), t('ui.k.close')]]));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (close(e)) { app.pop(p); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ nueva partida

PANELS.newrun = (app: App): Panel => {
  const m = app.meta;
  const shell = panelShell(t('hub.door'), { cls: 'wide', onClose: () => app.pop(p) });
  const modes: GameMode[] = ['historia', 'dificil', 'diario', 'semilla', 'pesadilla'];
  let mode: GameMode = m.profile.lastMode && modeUnlocked(m, m.profile.lastMode) ? m.profile.lastMode : 'historia';
  let zone = 1;
  const seedIn = h('input', { type: 'text', maxlength: 32, placeholder: t('ui.newrun.seed_ph'), 'aria-label': t('ui.newrun.seed') }) as HTMLInputElement;
  const nav = new Nav();
  let first = true;
  const render = (): void => {
    clear(shell.body);
    const items: HTMLElement[] = [];
    const rows: HTMLElement[][] = [];
    const modeRow = h('div', { class: 'cards' });
    for (const md of modes) {
      const ok = modeUnlocked(m, md);
      const b = h('button', { class: `card${md === mode ? ' on' : ''}${ok ? '' : ' off'}`, onclick: () => { if (ok) { mode = md; render(); } } },
        h('div', { class: 'ct' }, `${md === mode ? '▸ ' : ''}${t(`mode.${md}.name`)}`), h('p', {}, ok ? t(`mode.${md}.desc`) : t('mode.locked')));
      items.push(b);
      modeRow.append(b);
    }
    shell.body.append(h('h3', {}, t('ui.newrun.mode')), modeRow);
    rows.push([...items]);
    if (mode === 'semilla') { shell.body.append(h('div', { class: 'form', style: 'margin-top:8px' }, h('label', {}, t('ui.newrun.seed')), seedIn)); rows.push([seedIn]); }
    if (mode === 'diario') {
      const seed = dailySeed(new Date());
      const best = m.daily[seed];
      shell.body.append(h('p', { class: 'dim' }, t('ui.newrun.daily', { seed }) + (best ? ` · ${t('ui.newrun.best', { n: best.score })}` : '')));
    }
    const zones = startZones(m);
    if (zones.length > 1 && mode !== 'diario') {
      const row = h('div', { class: 'radio-row' });
      const zr: HTMLElement[] = [];
      for (const z of zones) {
        const b = h('button', { class: `btn${z === zone ? ' primary' : ''}`, onclick: () => { zone = z; render(); } }, t(`zone.${z}`));
        items.push(b);
        zr.push(b);
        row.append(b);
      }
      rows.push(zr);
      shell.body.append(h('h3', { style: 'margin-top:10px' }, t('ui.newrun.zone')), row);
    }
    const cls = m.profile.lastClass && classUnlocked(m, m.profile.lastClass) ? m.profile.lastClass : 'tecnico';
    const clsBtn = h('button', { class: 'btn', onclick: () => app.open('wardrobe') }, t('ui.newrun.change_class'));
    items.push(clsBtn);
    rows.push([clsBtn]);
    shell.body.append(h('h3', { style: 'margin-top:10px' }, t('ui.newrun.class')), h('p', {}, `${t(`class.${cls}.name`)} · `, clsBtn));
    const s = app.settings;
    const assists = [s.generousO2 && 'ui.opt.generousO2', s.assistHack && 'ui.opt.assistHack', s.skipHack && 'ui.opt.skipHack', s.dullEnemies && 'ui.opt.dullEnemies', s.longOrbit && 'ui.opt.longOrbit'].filter(Boolean) as string[];
    const optBtn = h('button', { class: 'btn', onclick: () => app.open('options', { tab: 'game' }) }, t('ui.newrun.adjust'));
    items.push(optBtn);
    rows.push([optBtn]);
    shell.body.append(h('h3', { style: 'margin-top:10px' }, t('ui.newrun.assists')), h('p', { class: 'dim' }, assists.length ? assists.map((k) => t(k)).join(' · ') : t('ui.newrun.no_assists'), ' ', optBtn));
    if (mode === 'pesadilla') shell.body.append(h('p', { class: 'warn' }, t('ui.newrun.nightmare_note')));
    const perks = m.upgrades.length;
    shell.body.append(h('p', { class: 'faint' }, t('ui.newrun.perks', { n: perks })));
    const go = h('button', { class: 'btn primary', style: 'font-size:1.1em;padding:8px 20px', onclick: () => {
      m.profile.lastMode = mode;
      const seed = mode === 'semilla' ? (seedIn.value.trim() || 'perséfone') : '';
      app.pop(p);
      app.startRun(app.newRunOptions({ mode, seed, classId: cls, startZone: (mode === 'diario' ? 1 : zone) as 1 }));
    } }, t('ui.newrun.go'));
    items.push(go);
    rows.push([go]);
    shell.body.append(h('div', { class: 'actions' }, go));
    nav.setRows(rows, !first);
    if (first) { nav.i = nav.items.indexOf(go); nav.mark(); first = false; }
  };
  render();
  shell.footer.append(app.hints([[KEY.arrows, t('ui.k.select')], [KEY.lr, t('ui.newrun.mode')], [KEY.enter(), t('ui.k.ok')], [KEY.esc(), t('ui.k.close')]]));
  const p: Panel = { el: shell.root, refresh: render, onCommand: (e) => { if (close(e)) { app.pop(p); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ bioimpresora y radio

PANELS.printer = (app: App): Panel => {
  const m = app.meta;
  const shell = panelShell(t('hub.printer'), { cls: 'narrow', onClose: () => app.pop(p) });
  shell.body.append(h('p', {}, t('ui.printer.body', { n: m.stats.deaths + 1 })), h('p', { class: 'dim' }, t('ui.printer.stats', { m: m.memoriasTotal, r: m.stats.runs })));
  if (m.flags.truth_seen) shell.body.append(h('p', { class: 'lore' }, t('ui.printer.truth')));
  shell.footer.append(app.hints([[[KEY.enter(), KEY.esc()], t('ui.k.close')]]));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (close(e) || e.cmd === 'confirm' || e.cmd === 'interact') { app.pop(p); return true; } return true; } };
  return p;
};

PANELS.radio = (app: App): Panel => {
  const m = app.meta;
  const stage = Math.min(4, m.arcs.bruno ?? 0);
  const shell = panelShell(t('hub.radio'), { cls: 'narrow', onClose: () => app.pop(p) });
  const n = 1 + ((m.stats.runs + stage) % 3);
  shell.body.append(h('p', { class: 'radio' }, t(`ui.radio.s${stage}.${n}`)));
  app.audio.play('radio');
  shell.footer.append(app.hints([[[KEY.enter(), KEY.esc()], t('ui.k.close')]]));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (close(e) || e.cmd === 'confirm' || e.cmd === 'interact') { app.pop(p); return true; } return true; } };
  return p;
};

void upgradeDef;
