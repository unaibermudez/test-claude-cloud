/** Paneles ligados a modales de la lógica: diálogo, hackeo, tienda, taller, autocirujano y terminal. */
import { App, PANELS } from '../app/app';
import { h, clear, img, Nav, panelShell, type Panel } from './dom';
import { t, tOpt } from '../i18n';
import { currentNode, visibleOptions, evalCond } from '../core/narrative';
import { sceneDef } from '../data/scenes';
import { portrait, drawAgora } from '../render/portraits';
import { validPicks, bufferCodes } from '../core/hack';
import { hackHint, terminalOps, RECIPES, canCraft, recipeAvailable } from '../core/player';
import { itemDef } from '../data/items';
import { iconURL } from '../render/icons';
import { itemDetail, itemName, isKnownItem } from './itemview';
import { countItem, hasPerkFlag } from '../core/rules';
import { IMPLANT_SLOTS } from '../core/content';
import { BAL } from '../data/balance';
import type { CommandEvent } from '../input/input';
import type { Cond } from '../core/content';

// ------------------------------------------------------------------ diálogo

function condHint(c: Cond | undefined): string {
  if (!c) return '';
  if ('trustGte' in c) return t('ui.req.trust', { n: c.trustGte });
  if ('has' in c) return t('ui.req.has', { item: t(`item.${c.has}.name`) });
  if ('energyGte' in c) return t('ui.req.energy', { n: c.energyGte });
  if ('logsGte' in c) return t('ui.req.logs', { n: c.logsGte });
  return t('ui.req.locked');
}

PANELS.modal_dialog = (app: App): Panel => {
  const st = app.run!;
  const portraitCv = h('canvas', { class: 'portrait', width: 32, height: 32 }) as HTMLCanvasElement;
  const who = h('div', { class: 'who' });
  const text = h('div', { class: 'text', 'aria-live': 'polite' });
  const opts = h('div', { class: 'opts' });
  const box = h('div', { class: 'dialog', role: 'dialog' }, portraitCv, h('div', {}, who, text, opts));
  const nav = new Nav();
  let speaker = '';
  let full = '';
  let shown = 0;
  let typing = false;
  let lastNode = '';
  const render = (): void => {
    const cur = currentNode(st);
    if (!cur) return;
    const md = st.modal;
    const nodeKey = md && md.kind === 'dialog' ? `${md.scene}:${md.node}` : '';
    if (nodeKey === lastNode) return;
    lastNode = nodeKey;
    speaker = cur.node.speaker;
    box.className = `dialog speaker-${speaker}`;
    clear(who);
    const nm = speaker === 'narrator' ? '' : speaker === 'player' ? st.player.name : t(`npc.${speaker}.name`);
    who.append(h('span', {}, nm), h('span', { class: 'scene' }, t(cur.scene.title),
      app.voice.available ? h('button', { class: 'voicebtn', title: t('ui.voice.replay'), 'aria-label': t('ui.voice.replay'), onclick: () => app.voice.speak(full, speaker) }, '🔊') : null));
    if (speaker !== 'agora') {
      const c = portraitCv.getContext('2d')!;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, 32, 32);
      c.drawImage(portrait(speaker, st.player.classId), 0, 0);
    }
    full = t(cur.node.text);
    if (app.settings.voiceDialogs) app.voice.speak(full, speaker === 'player' ? 'player' : speaker);
    shown = app.settings.reduceFlicker ? full.length : 0;
    typing = shown < full.length;
    text.textContent = full.slice(0, shown);
    clear(opts);
    const shownOpts = visibleOptions(st);
    const btns: HTMLElement[] = [];
    if (!cur.node.options || cur.node.options.length === 0) {
      const b = h('button', { class: 'opt', onclick: () => choose(0) }, h('span', { class: 'n' }, '▸'), t(cur.node.next ? 'ui.dialog.next' : 'ui.dialog.end'));
      btns.push(b);
    } else {
      shownOpts.forEach((o, k) => {
        const b = h('button', { class: `opt${o.enabled ? '' : ' locked'}`, disabled: !o.enabled, onclick: () => choose(o.index) },
          h('span', { class: 'n' }, `${k + 1}.`), t(o.opt.text), !o.enabled ? h('span', { class: 'req' }, `(${condHint(o.opt.cond)})`) : null);
        btns.push(b);
      });
    }
    btns.forEach((b) => opts.append(b));
    nav.set(btns, false);
    opts.style.visibility = typing ? 'hidden' : 'visible';
  };
  const choose = (index: number): void => {
    if (typing) { finishTyping(); return; }
    lastNode = '';
    app.act({ t: 'choice', index });
  };
  const finishTyping = (): void => {
    shown = full.length; typing = false;
    text.textContent = full;
    opts.style.visibility = 'visible';
  };
  render();
  let lastT = 0;
  const p = {
    el: box,
    refresh: render,
    onClose: () => app.voice.stop(),
    tick: (now: number) => {
      if (typing && now - lastT > 16) {
        lastT = now;
        shown = Math.min(full.length, shown + 2);
        text.textContent = full.slice(0, shown);
        if (shown >= full.length) finishTyping();
      }
      if (speaker === 'agora') {
        const c = portraitCv.getContext('2d')!;
        drawAgora(c, 32, st.narrative.trust, now, app.settings.reduceFlicker);
      }
    },
    onCommand: (e: CommandEvent) => {
      if (typing && (e.cmd === 'confirm' || e.cmd === 'interact' || e.cmd === 'wait' || e.cmd === 'cancel')) { finishTyping(); return true; }
      if (e.cmd === 'num' && e.num !== undefined) {
        const so = visibleOptions(st);
        const o = so[e.num - 1];
        if (o && o.enabled) choose(o.index);
        else if (!so.length && e.num === 1) choose(0);
        return true;
      }
      if (e.cmd === 'wait') { nav.current?.click(); return true; }
      return nav.handle(e) || true;
    },
  };
  void sceneDef; void tOpt; void evalCond;
  return p;
};

// ------------------------------------------------------------------ hackeo

PANELS.modal_hack = (app: App): Panel => {
  const st = app.run!;
  const shell = panelShell(t('ui.hack.title'), { cls: 'wide' });
  const nav = new Nav();
  let sel = -1;
  const render = (): void => {
    const md = st.modal;
    if (!md || md.kind !== 'hack') return;
    const hk = md.hack;
    clear(shell.body);
    const valid = new Set(validPicks(hk));
    const hint = st.opts.assistHack ? hackHint(st) : -1;
    const grid = h('div', { class: 'hgrid', style: `grid-template-columns:repeat(${hk.n}, auto)` });
    const cells: HTMLElement[] = [];
    for (let i = 0; i < hk.n * hk.n; i++) {
      const r = Math.floor(i / hk.n); const c = i % hk.n;
      const onLine = hk.axis === 'row' ? r === hk.line : c === hk.line;
      const used = hk.picks.includes(i);
      const cls = ['hcell', onLine ? 'line' : '', valid.has(i) ? 'valid' : '', used ? 'used' : '', i === hint ? 'hint' : ''].join(' ');
      const b = h('button', { class: cls, disabled: !valid.has(i), 'aria-label': `${hk.grid[i]} ${r + 1},${c + 1}`, onclick: () => { app.act({ t: 'hack', cell: i }); } }, used ? '··' : hk.grid[i]);
      cells.push(b);
      grid.append(b);
    }
    // navegación: solo celdas válidas
    const validCells = cells.filter((_, i) => valid.has(i));
    nav.set(validCells, false);
    if (sel >= 0) { const k = validCells.indexOf(cells[sel]); if (k >= 0) { nav.i = k; nav.mark(); } }
    if (hint >= 0) { const k = validCells.indexOf(cells[hint]); if (k >= 0 && sel < 0) { nav.i = k; nav.mark(); } }
    const buf = bufferCodes(hk);
    const bufEl = h('div', { class: 'buffer' }, ...Array.from({ length: hk.buffer }, (_, i) => h('span', { class: buf[i] ? 'f' : '' }, buf[i] ?? '')));
    const targets = h('div', {}, ...hk.targets.map((tg, k) => {
      // cuántos códigos del objetivo ya coinciden con el final del búfer
      let match = 0;
      for (let m = Math.min(tg.seq.length, buf.length); m > 0; m--) {
        if (buf.slice(buf.length - m).join() === tg.seq.slice(0, m).join()) { match = m; break; }
      }
      return h('div', { class: `target${tg.done ? ' done' : ''}` }, h('span', {}, k === 0 ? t('ui.hack.main') : t(`ui.hack.reward.${tg.reward}`)),
        h('span', { class: 'seq' }, ...tg.seq.map((s, i) => h('span', { class: tg.done || i < match ? 'm' : '' }, s))), tg.done ? '✓' : '');
    }));
    const side = h('div', {},
      h('h3', {}, t('ui.hack.buffer')), bufEl,
      h('h3', { style: 'margin-top:8px' }, t('ui.hack.targets')), targets,
      h('p', { class: 'dim', style: 'margin-top:10px' }, t('ui.hack.rules')),
      h('p', { class: 'dim' }, t(hk.axis === 'row' ? 'ui.hack.row' : 'ui.hack.col', { n: hk.line + 1 })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => app.act({ t: 'hackSkip' }) }, t('ui.hack.skip', { n: BAL.skipHackCost })),
        hk.success
          ? h('button', { class: 'btn primary', onclick: () => app.act({ t: 'hackAbort' }) }, t('ui.hack.finish'))
          : h('button', { class: 'btn danger', onclick: () => app.act({ t: 'hackAbort' }) }, t('ui.hack.abort'))),
      hk.success ? h('p', { class: 'good' }, t('ui.hack.bonus')) : null);
    shell.body.append(h('div', { class: 'hack' }, grid, side));
  };
  shell.footer.append(h('span', {}, t('ui.hack.footer')));
  render();
  nav.onSelect = () => { sel = -1; };
  const p: Panel = {
    el: shell.root,
    refresh: render,
    onCommand: (e) => {
      if (e.cmd === 'cancel' || e.cmd === 'pause') { app.act({ t: 'hackAbort' }); return true; }
      if (e.cmd === 'up' || e.cmd === 'left') { nav.move(-1); return true; }
      if (e.cmd === 'down' || e.cmd === 'right') { nav.move(1); return true; }
      return nav.handle(e) || true;
    },
  };
  return p;
};

// ------------------------------------------------------------------ terminal

PANELS.modal_terminal = (app: App): Panel => {
  const st = app.run!;
  const md = st.modal as { kind: 'terminal'; propId: number };
  const close = (): void => { app.act({ t: 'closeModal' }); };
  const shell = panelShell(t('ui.term.title'), { cls: 'narrow', onClose: close });
  const nav = new Nav();
  const render = (): void => {
    const pr = st.map.props.find((q) => q.id === md.propId);
    if (!pr) return;
    clear(shell.body);
    const ops = terminalOps(st, pr);
    const menu = h('div', { class: 'menu' });
    const items: HTMLElement[] = [];
    if ((pr.lockout ?? 0) > 0) shell.body.append(h('p', { class: 'danger' }, t('ui.term.lockout', { n: pr.lockout ?? 0 })));
    shell.body.append(h('p', { class: 'dim' }, pr.hacked ? t('ui.term.access') : t('ui.term.locked', { n: pr.hack ?? 1 })));
    for (const o of ops) {
      let label = '';
      if (o.id.startsWith('vent:')) {
        const s = Number(o.id.slice(5));
        const enemies = st.actors.filter((a) => !a.dead && a.faction === 'enemy' && st.map.sec[a.y * st.map.w + a.x] === s).length;
        const you = st.map.sec[st.actors.find((a) => a.id === st.pid)!.y * st.map.w + st.actors.find((a) => a.id === st.pid)!.x] === s;
        label = t('ui.term.vent', { n: s + 1, e: enemies }) + (you ? ` · ${t('ui.term.vent_you')}` : '');
      } else label = t(`ui.term.op.${o.id}`);
      if (o.cost) label += ` (${o.cost} ${t('ui.energy')})`;
      const b = h('button', { class: 'mi', disabled: st.player.energy < o.cost || ((pr.lockout ?? 0) > 0 && o.id === 'hack'), onclick: () => app.act({ t: 'termOp', op: o.id }) }, label);
      items.push(b);
    }
    items.push(h('button', { class: 'mi', onclick: close }, t('ui.term.logout')));
    menu.append(...items);
    shell.body.append(menu);
    nav.set(items, true);
  };
  render();
  const p: Panel = { el: shell.root, refresh: render, onCommand: (e) => { if (e.cmd === 'cancel' || e.cmd === 'pause') { close(); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ tienda

PANELS.modal_shop = (app: App): Panel => {
  const st = app.run!;
  const md = st.modal as { kind: 'shop'; propId: number };
  const pr = st.map.props.find((q) => q.id === md.propId)!;
  const merchant = pr.kind === 'merchant';
  const close = (): void => { app.act({ t: 'closeModal' }); };
  let tab = 0;
  const tabs = h('div', { class: 'tabs' });
  const shell = panelShell(t(merchant ? 'ui.shop.merchant' : 'ui.shop.vending'), { cls: 'wide', tabs, onClose: close });
  const nav = new Nav();
  const render = (): void => {
    clear(tabs);
    if (merchant) ['ui.shop.buy', 'ui.shop.sell'].forEach((k, i) => tabs.append(h('button', { class: `tab${tab === i ? ' on' : ''}`, onclick: () => { tab = i; nav.i = 0; render(); } }, t(k))));
    clear(shell.body);
    const list = h('div', { class: 'list' });
    const detail = h('div');
    const btns: HTMLElement[] = [];
    const shows: (() => void)[] = [];
    if (tab === 0) {
      (pr.stock ?? []).forEach((e, i) => {
        const can = e.n > 0 && st.player.scrap >= e.price;
        const b = h('button', { class: `item${e.n > 0 ? '' : ' off'}`, onclick: () => { app.act({ t: 'buy', index: i }); render(); } },
          img(iconURL(e.item)), h('span', { class: 'grow' }, t(`item.${e.item}.name`)), h('span', { class: `r${can ? '' : ' danger'}` }, `${e.price} ⚙ · ×${e.n}`));
        btns.push(b);
        shows.push(() => { clear(detail); detail.append(itemDetail(null, { id: e.item })); });
      });
    } else {
      st.player.inv.forEach((s, slot) => {
        const d = itemDef(s.id);
        if (d.type === 'quest') return;
        const price = Math.max(1, Math.round(d.price * 0.4));
        const b = h('button', { class: 'item', onclick: () => { app.act({ t: 'sell', slot }); render(); } },
          img(iconURL(s.id, st.appear[s.id], !isKnownItem(st, s.id))), h('span', { class: 'grow' }, itemName(st, s.id)), h('span', { class: 'r' }, `+${price} ⚙`));
        btns.push(b);
        shows.push(() => { clear(detail); detail.append(itemDetail(st, s)); });
      });
    }
    btns.forEach((b) => list.append(b));
    if (!btns.length) list.append(h('p', { class: 'dim' }, t('ui.shop.empty')));
    nav.onSelect = (i) => shows[i]?.();
    nav.set(btns);
    shows[nav.i]?.();
    shell.body.append(h('p', { class: 'dim' }, `${t('ui.shop.scrap')}: ⚙ ${st.player.scrap} · ${t('ui.inv.slots', { n: st.player.inv.length, max: BAL.invSize })}`), h('div', { class: 'cols' }, list, detail));
  };
  render();
  const p: Panel = {
    el: shell.root, refresh: render,
    onCommand: (e) => {
      if (e.cmd === 'cancel' || e.cmd === 'pause') { close(); return true; }
      if (merchant && (e.cmd === 'next' || e.cmd === 'prev' || e.cmd === 'left' || e.cmd === 'right')) { tab = 1 - tab; nav.i = 0; render(); return true; }
      return nav.handle(e) || true;
    },
  };
  return p;
};

// ------------------------------------------------------------------ taller

PANELS.modal_workbench = (app: App): Panel => {
  const st = app.run!;
  const close = (): void => { app.act({ t: 'closeModal' }); };
  const shell = panelShell(t('ui.craft.title'), { cls: 'wide', onClose: close });
  const nav = new Nav();
  const render = (): void => {
    clear(shell.body);
    const list = h('div', { class: 'list' });
    const detail = h('div');
    const btns: HTMLElement[] = [];
    const recs = RECIPES.filter((r) => recipeAvailable(st, r));
    for (const r of recs) {
      const ok = canCraft(st, r);
      const needs = r.needs.map(([id, n]) => `${t(`item.${id}.name`)} ${countItem(st, id)}/${n}`).join(' · ');
      const b = h('button', { class: `item${ok ? '' : ' off'}`, onclick: () => { if (ok) { app.act({ t: 'craft', recipe: r.id }); render(); } } },
        img(iconURL(r.out)), h('span', { class: 'grow' }, `${t(`item.${r.out}.name`)}${r.n > 1 ? ` ×${r.n}` : ''}`), h('span', { class: `r${ok ? ' good' : ''}` }, needs));
      btns.push(b);
    }
    btns.forEach((b) => list.append(b));
    nav.onSelect = (i) => { clear(detail); const r = recs[i]; if (r) detail.append(itemDetail(null, { id: r.out, n: r.n })); };
    nav.set(btns);
    nav.onSelect(nav.i);
    if (!hasPerkFlag(st, 'recipes_adv')) shell.body.append(h('p', { class: 'faint' }, t('ui.craft.more')));
    shell.body.append(h('div', { class: 'cols' }, list, detail));
  };
  render();
  const p: Panel = { el: shell.root, refresh: render, onCommand: (e) => { if (e.cmd === 'cancel' || e.cmd === 'pause') { close(); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ autocirujano

PANELS.modal_surgeon = (app: App): Panel => {
  const st = app.run!;
  const close = (): void => { app.act({ t: 'closeModal' }); };
  const shell = panelShell(t('ui.surgeon.title'), { cls: 'wide', onClose: close });
  const nav = new Nav();
  const render = (): void => {
    clear(shell.body);
    const free = hasPerkFlag(st, 'surgeon_free');
    const list = h('div', { class: 'list' });
    const detail = h('div');
    const btns: HTMLElement[] = [];
    const shows: (() => void)[] = [];
    list.append(h('h3', {}, t('ui.surgeon.installed')));
    for (const slot of IMPLANT_SLOTS) {
      const cur = st.player.implants[slot];
      if (!cur) continue;
      const b = h('button', { class: `item${cur.cursed ? ' cursed' : ''}`, onclick: () => { app.act({ t: 'uninstall', implant: slot }); render(); } },
        img(iconURL(cur.id)), h('span', { class: 'grow' }, `${t(`slot.${slot}`)}: ${t(`item.${cur.id}.name`)}`), h('span', { class: 'r' }, t(cur.cursed ? 'ui.surgeon.remove_broken' : 'ui.surgeon.remove')));
      btns.push(b);
      shows.push(() => { clear(detail); detail.append(itemDetail(st, { id: cur.id, cursed: cur.cursed })); });
      list.append(b);
    }
    list.append(h('h3', { style: 'margin-top:8px' }, t('ui.surgeon.available', { n: free ? 0 : 10 })));
    st.player.inv.forEach((s, slot) => {
      if (itemDef(s.id).type !== 'implant') return;
      const b = h('button', { class: 'item', onclick: () => { app.act({ t: 'install', slot }); render(); } },
        img(iconURL(s.id, st.appear[s.id], !isKnownItem(st, s.id))), h('span', { class: 'grow' }, itemName(st, s.id)), h('span', { class: 'r' }, t(`slot.${itemDef(s.id).implant!.slot}`)));
      btns.push(b);
      shows.push(() => { clear(detail); detail.append(itemDetail(st, s)); });
      list.append(b);
    });
    const idb = h('button', { class: 'item', onclick: () => { app.act({ t: 'identifyLab' }); render(); } }, h('span', { class: 'grow' }, t('ui.surgeon.identify')), h('span', { class: 'r' }, '15 ⚙'));
    btns.push(idb);
    shows.push(() => { clear(detail); detail.append(h('div', { class: 'detail' }, h('p', {}, t('ui.surgeon.identify_desc')))); });
    list.append(h('h3', { style: 'margin-top:8px' }, t('ui.surgeon.lab')), idb);
    nav.onSelect = (i) => shows[i]?.();
    nav.set(btns);
    shows[nav.i]?.();
    shell.body.append(h('p', { class: 'dim' }, `⚙ ${st.player.scrap}`), h('div', { class: 'cols' }, list, detail));
  };
  render();
  const p: Panel = { el: shell.root, refresh: render, onCommand: (e) => { if (e.cmd === 'cancel' || e.cmd === 'pause') { close(); return true; } return nav.handle(e) || true; } };
  return p;
};
