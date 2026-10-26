/** Pantallas completas: aviso de contenido, título, introducción, creación, Cápsula, fin de partida, créditos. */
import { App, PANELS } from '../app/app';
import { h, clear, Nav, KEY, scrollBody, type Panel } from './dom';
import { STATIONS } from '../render/hub';
import { t, tOpt, setPronoun, setGlobal, LANGS, type Lang } from '../i18n';
import type { Pronoun, RunState } from '../core/state';
import { hasEnemy } from '../data/enemies';
import { MAIN_ENDINGS } from '../data/endings';
import { DIR_OF } from '../input/input';
import { getStats } from '../core/rules';

const VERSION = '1.1.0';

function menuPanel(el: HTMLElement, items: HTMLElement[], extra?: (e: Parameters<NonNullable<Panel['onCommand']>>[0]) => boolean, numbered = false): Panel & { nav: Nav } {
  const nav = new Nav();
  nav.numbered = numbered;
  nav.set(items);
  return {
    el, nav,
    onCommand: (e) => {
      if (extra && extra(e)) return true;
      return nav.handle(e);
    },
  };
}

function mi(label: string, fn: () => void, disabled = false): HTMLButtonElement {
  return h('button', { class: 'mi', onclick: fn, disabled }, label);
}

// ------------------------------------------------------------------ aviso de contenido

PANELS.screen_warning = (app: App): Panel => {
  const go = (): void => { app.settings.warningSeen = true; app.saveSettings(); app.toScreen('title'); };
  const langs = h('div', { class: 'radio-row', style: 'margin:8px 0' }, ...LANGS.map((l) => h('button', {
    class: `btn${app.settings.lang === l ? ' primary' : ''}`, onclick: () => { app.settings.lang = l as Lang; app.saveSettings(); app.toScreen('warning'); },
  }, l === 'es' ? 'Español' : 'English')));
  const btn = h('button', { class: 'btn primary', onclick: go }, t('ui.warning.continue'));
  const el = h('div', { class: 'screen' }, h('div', { class: 'warning' },
    h('h2', {}, t('ui.warning.title')),
    h('p', {}, t('ui.warning.body')),
    h('p', { class: 'dim' }, t('ui.warning.options')),
    langs,
    h('div', { class: 'actions' }, btn),
    app.hints([[KEY.lr, t('ui.opt.lang')], [KEY.arrows, t('ui.k.select')], [KEY.enter(), t('ui.k.ok')]])));
  const nav = new Nav();
  nav.setRows([Array.from(langs.children) as HTMLElement[], [btn]]);
  nav.i = nav.items.indexOf(btn); nav.mark();
  return {
    el,
    onCommand: (e) => {
      // ←→ cambian el idioma directamente aunque la selección esté en «Continuar»
      if ((e.cmd === 'left' || e.cmd === 'right') && nav.current === btn) { const next = LANGS[(LANGS.indexOf(app.settings.lang) + 1) % LANGS.length] as Lang; app.settings.lang = next; app.saveSettings(); app.toScreen('warning'); return true; }
      return nav.handle(e);
    },
  };
};

// ------------------------------------------------------------------ título

PANELS.screen_title = (app: App): Panel => {
  const items: HTMLButtonElement[] = [];
  const hasRun = !!app.run && !app.run.over;
  if (hasRun) items.push(mi(t('ui.title.continue'), () => app.toScreen('run')));
  items.push(mi(hasRun ? t('ui.title.capsule') : t('ui.title.wake'), () => {
    if (!app.meta.introSeen) app.toScreen('intro');
    else app.toScreen('hub');
  }));
  items.push(mi(t('ui.title.options'), () => app.open('options')));
  items.push(mi(t('ui.title.credits'), () => app.toScreen('credits')));
  const el = h('div', { class: 'screen' },
    h('div', { class: 'title-logo' }, 'DERIVA'),
    h('div', { class: 'title-sub' }, t('ui.title.sub')),
    h('div', { class: 'menu', role: 'menu' }, ...items),
    hasRun ? h('p', { class: 'dim', style: 'margin-top:16px' }, t('ui.title.saved', { zone: t(`zone.${app.run!.map.zone}`), n: app.run!.floorNo })) : null,
    h('div', { class: 'title-keys' }, app.hints([[KEY.arrows, t('ui.k.select')], [KEY.enter(), t('ui.k.ok')], [`1–${items.length}`, t('ui.k.choose')]])),
    h('div', { class: 'version' }, `v${VERSION}`));
  app.audio.music?.setTheme('title');
  return menuPanel(el, items, undefined, true);
};

// ------------------------------------------------------------------ introducción

PANELS.screen_intro = (app: App): Panel => {
  const lines = ['intro.1', 'intro.2', 'intro.3', 'intro.4', 'intro.5', 'intro.6', 'intro.agora'];
  const box = h('div', { class: 'intro-text' });
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const next = (): void => {
    if (i >= lines.length) { finish(); return; }
    const k = lines[i++];
    box.append(h('p', { class: `ln${k === 'intro.agora' ? ' agora' : ''}` }, t(k)));
    if (app.settings.voiceDialogs) app.voice.speak(t(k).replace(/^ÁGORA:\s*/, ''), k === 'intro.agora' ? 'agora' : 'narrator');
    timer = setTimeout(next, k === 'intro.agora' ? 5000 : 2300);
  };
  const finish = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    app.meta.introSeen = true;
    app.saveMeta();
    app.toScreen('create');
  };
  const el = h('div', { class: 'screen' }, box, h('p', { class: 'faint', style: 'margin-top:30px' }, t('intro.skip')));
  app.audio.music?.setTheme('title');
  setTimeout(next, 400);
  return {
    el,
    onCommand: () => { finish(); return true; },
    onClose: () => { if (timer) clearTimeout(timer); },
  };
};

// ------------------------------------------------------------------ creación (nombre y pronombres)

function identityForm(app: App, onDone: () => void, submitLabel: string): { el: HTMLElement; rows: HTMLElement[][] } {
  const input = h('input', { type: 'text', maxlength: 24, value: app.meta.profile.name || t('ui.default_name'), 'aria-label': t('ui.create.name') }) as HTMLInputElement;
  let pron: Pronoun = app.meta.profile.pronoun ?? 'elle';
  const pbtns: HTMLButtonElement[] = [];
  const preview = h('p', { class: 'dim' });
  const refresh = (): void => {
    pbtns.forEach((b) => b.classList.toggle('primary', b.dataset.p === pron));
    setPronoun(pron);
    setGlobal('name', input.value || t('ui.default_name'));
    preview.textContent = t('ui.create.preview');
  };
  for (const p of ['el', 'ella', 'elle'] as Pronoun[]) {
    const b = h('button', { class: 'btn', 'data-p': p, onclick: () => { pron = p; refresh(); } }, t(`ui.pronoun.${p}`));
    pbtns.push(b);
  }
  input.addEventListener('input', refresh);
  const ok = h('button', { class: 'btn primary', onclick: () => {
    app.meta.profile.name = input.value.trim() || t('ui.default_name');
    app.meta.profile.pronoun = pron;
    app.saveMeta();
    onDone();
  } }, submitLabel);
  refresh();
  const el = h('div', { class: 'form' },
    h('label', {}, t('ui.create.name')), input,
    h('label', {}, t('ui.create.pronouns')), h('div', { class: 'radio-row' }, ...pbtns),
    h('span', {}), preview);
  return { el: h('div', {}, el, h('div', { class: 'actions' }, ok)), rows: [[input], pbtns, [ok]] };
}

function formHints(app: App): HTMLElement {
  return app.hints([[KEY.arrows, t('ui.k.next')], [KEY.lr, t('ui.create.pronouns')], [KEY.enter(), t('ui.k.ok')]]);
}

PANELS.screen_create = (app: App): Panel => {
  const f = identityForm(app, () => app.toScreen('hub'), t('ui.create.wake'));
  const el = h('div', { class: 'screen' }, h('div', { class: 'warning', style: 'border-color:var(--line2)' },
    h('h2', {}, t('ui.create.title')), h('p', { class: 'dim' }, t('ui.create.body')), f.el, formHints(app)));
  const nav = new Nav();
  nav.setRows(f.rows);
  return { el, onCommand: (e) => nav.handle(e) };
};

PANELS.identity = (app: App): Panel => {
  const close = (): void => app.pop(p);
  const f = identityForm(app, close, t('ui.save'));
  const replay = h('button', { class: 'btn', onclick: () => { app.pop(p); app.toScreen('intro'); } }, t('ui.replay_intro'));
  const el = h('div', { class: 'overlay' }, h('div', { class: 'panel narrow' },
    h('header', {}, h('h2', {}, t('hub.pod')), h('button', { class: 'btn', onclick: close }, '✕')),
    h('div', { class: 'body' }, h('p', { class: 'dim' }, t('hub.pod.desc.long')), f.el,
      h('div', { class: 'actions' }, replay)), h('footer', {}, formHints(app))));
  const nav = new Nav();
  nav.setRows([...f.rows, [replay]]);
  const p: Panel = { el, onCommand: (e) => { if (e.cmd === 'cancel' || e.cmd === 'pause') { close(); return true; } return nav.handle(e); } };
  return p;
};

// ------------------------------------------------------------------ La Cápsula (base)

PANELS.screen_hub = (app: App): Panel => {
  const mem = h('div', { class: 'mem' });
  const tip = h('div', { class: 'hubtip' });
  const greet = h('p', { class: 'agora', style: 'max-width:380px;margin:6px 0 0' });
  const m = app.meta;
  const lastDeaths = m.stats.deaths;
  if (m.stats.runs === 0) greet.textContent = t('hub.agora.first');
  else {
    const last = m.history[0];
    const k = Math.min(8, Math.max(1, lastDeaths));
    setGlobal('deaths', lastDeaths);
    greet.textContent = last && !last.victory ? t(`agora.death.${((lastDeaths - 1) % 8) + 1}`, { floor: last.floor, deaths: lastDeaths }) : t('hub.agora.return');
    void k;
  }
  const hud = h('div', { class: 'hubhud' }, h('div', {}, h('strong', {}, t('hub.title'))), mem, greet);
  const el = h('div', { class: 'passthrough' }, hud, tip);
  let lastKey = '';
  const refresh = (): void => {
    const s = app.hub.adjacent();
    const key = `${app.meta.memorias}|${s?.id ?? ''}|${app.settings.lang}`;
    if (key === lastKey) return;
    lastKey = key;
    mem.textContent = t('hub.memorias', { n: app.meta.memorias });
    clear(tip);
    if (s) tip.append(h('div', { class: 'n' }, t(`hub.${s.id}`)), h('div', { class: 'dim' }, t(`hub.${s.id}.desc`)), h('div', { class: 'faint' }, t('ui.hub.use', { k: app.input.label('interact') })));
    else tip.append(h('div', { class: 'dim' }, t('hub.hint', { k: app.input.label('interact') })));
  };
  refresh();
  app.checkMetaAchievements();
  return {
    el,
    refresh,
    onCommand: (e) => {
      const d = DIR_OF[e.cmd];
      if (d !== undefined) return true; // movimiento continuo con teclas mantenidas (HubScene.update)
      if (e.cmd === 'interact' || e.cmd === 'confirm') {
        const s = app.hub.adjacent();
        if (s) app.open(s.panel);
        return true;
      }
      if (e.cmd === 'pause' || e.cmd === 'cancel') { app.open('hubmenu'); return true; }
      if (e.cmd === 'archive') { app.open('archive'); return true; }
      if (e.cmd === 'next' || e.cmd === 'prev' || e.cmd === 'map') { app.open('hubstations'); return true; }
      if (e.cmd === 'help') { app.open('help'); return true; }
      return false;
    },
    tick: () => refresh(),
  } as Panel & { tick: () => void };
};

PANELS.hubstations = (app: App): Panel => {
  const close = (): void => app.pop(p);
  const list = STATIONS.filter((s) => s.visible(app.meta));
  const items = list.map((s) => h('button', { class: 'mi station', onclick: () => { app.pop(p); app.hub.goTo(s); app.open(s.panel); } },
    h('span', { class: 'grow' }, t(`hub.${s.id}`)), h('small', { class: 'faint' }, t(`hub.${s.id}.desc`))));
  const el = h('div', { class: 'overlay' }, h('div', { class: 'panel narrow' },
    h('header', {}, h('h2', {}, t('ui.hub.stations')), h('button', { class: 'btn', onclick: close, 'aria-label': 'close' }, '✕')),
    h('div', { class: 'body' }, h('div', { class: 'menu' }, ...items)),
    h('footer', {}, app.hints([[KEY.arrows, t('ui.k.select')], [KEY.enter(), t('ui.k.ok')], ['1–9', t('ui.k.choose')], [KEY.esc(), t('ui.k.close')]]))));
  const nav = new Nav();
  nav.numbered = true;
  nav.set(items);
  const p: Panel = { el, onCommand: (e) => { if (e.cmd === 'cancel' || e.cmd === 'pause' || e.cmd === 'next' || e.cmd === 'map') { close(); return true; } return nav.handle(e) || true; } };
  return p;
};

PANELS.hubmenu = (app: App): Panel => {
  const close = (): void => app.pop(p);
  const items = [
    mi(t('ui.resume'), close),
    mi(t('ui.hub.stations'), () => { app.pop(p); app.open('hubstations'); }),
    mi(t('ui.title.options'), () => app.open('options')),
    mi(t('ui.help'), () => app.open('help')),
    mi(t('ui.to_title'), () => { app.toScreen('title'); }),
  ];
  const el = h('div', { class: 'overlay' }, h('div', { class: 'panel narrow' }, h('header', {}, h('h2', {}, t('hub.title'))), h('div', { class: 'body' }, h('div', { class: 'menu' }, ...items))));
  const nav = new Nav(); nav.numbered = true; nav.set(items);
  const p: Panel = { el, onCommand: (e) => { if (e.cmd === 'cancel' || e.cmd === 'pause') { close(); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ fin de partida

export function causeText(cause: string): string {
  if (hasEnemy(cause)) return t('ui.cause.killed_by', { who: t(`enemy.${cause}.name`) });
  return tOpt(`ui.cause.${cause}`) || t('ui.cause.unknown');
}

function fatesFor(run: RunState): string[] {
  const out: string[] = [];
  const f = run.metaSnapshot.fates;
  const arcs = run.metaSnapshot.arcs;
  for (const npc of ['celia', 'tomas', 'bruno', 'solis', 'lenz', 'faro'] as const) {
    let v = f[npc];
    if (!v && (arcs[npc] ?? 0) >= 1) v = { celia: 'lost', tomas: 'alone', bruno: 'unknown', solis: 'enemy', lenz: 'static', faro: 'radio' }[npc];
    if (!v) continue;
    const txt = tOpt(`fate.${npc}.${v}`);
    if (txt) out.push(txt);
  }
  return out;
}

PANELS.screen_over = (app: App): Panel => {
  const res = app.lastSummary;
  if (!res) { setTimeout(() => app.toScreen('hub')); return { el: h('div') }; }
  const { summary, achievements, run } = res;
  const ending = run.over?.ending ?? null;
  const victory = !!run.over?.victory;
  setGlobal('survivors', run.narrative.survivors);
  const parts: HTMLElement[] = [];
  if (ending) {
    parts.push(h('h2', { style: 'font-size:1.6em;margin-bottom:10px' }, t(`ending.${ending}.title`)));
    const body = h('div', { class: 'epilogue' }, h('p', {}, t(`ending.${ending}.body`)));
    if (ending === 'verdadero') body.append(h('p', {}, t('ending.verdadero.body2')));
    if (ending === 'redencion') body.append(h('p', { class: 'dim' }, t(run.metaSnapshot.fates.solis === 'ally' ? 'ending.redencion.extra_solis' : 'ending.redencion.extra_none')));
    if (victory) {
      const fates = fatesFor(run);
      if (fates.length) body.append(h('h3', { style: 'margin-top:14px' }, t('fate.title')), ...fates.map((f) => h('p', { class: 'fate' }, f)));
    }
    parts.push(body);
    if (app.settings.voiceDialogs) app.voice.speak(body.textContent ?? '', 'narrator');
  } else {
    parts.push(h('h2', { style: 'font-size:1.6em' }, t('ui.over.dead')));
    parts.push(h('p', { class: 'danger' }, causeText(summary.cause)));
  }
  const stat = (k: string, v: string | number): HTMLElement => h('div', {}, h('span', { class: 'k' }, t(k)), String(v));
  const st = run.stats;
  parts.push(h('div', { class: 'summary' },
    stat('ui.over.zone', `${t(`zone.${summary.zone}`)} · ${summary.floor}`),
    stat('ui.over.floors', st.floors),
    stat('ui.over.turns', st.turns),
    stat('ui.over.kills', st.kills),
    stat('ui.over.stealth', st.stealthKills),
    stat('ui.over.hacks', st.hacks),
    stat('ui.over.vented', st.vented),
    stat('ui.over.logs', `${run.narrative.logsFound.length} (+${summary.newLogs})`),
    stat('ui.over.trust', `${run.narrative.trust} · ${t(`agora.trust.${run.narrative.trust < 20 ? 'hostile' : run.narrative.trust < 40 ? 'wary' : run.narrative.trust < 60 ? 'neutral' : run.narrative.trust < 80 ? 'warm' : 'close'}`)}`),
    stat('ui.over.o2', Math.round(st.o2Used)),
    stat('ui.over.score', summary.score),
    stat('ui.over.memorias', `+${summary.memorias}`),
  ));
  if (achievements.length) parts.push(h('div', {}, h('h3', {}, t('ui.over.achievements')), ...achievements.map((a) => h('p', { class: 'good' }, `★ ${t(`ach.${a}.name`)}`))));
  if (ending && MAIN_ENDINGS.includes(ending) && !victory) parts.push(h('p', { class: 'dim' }, ''));
  if (run.opts.mode === 'diario') parts.push(h('p', { class: 'dim' }, t('ui.over.daily', { seed: run.seed })));
  else parts.push(h('p', { class: 'faint' }, t('ui.over.seed', { seed: run.seed })));
  const btn = h('button', { class: 'btn primary', onclick: () => app.toScreen(victory ? 'credits' : 'hub') }, t(victory ? 'ui.over.credits' : 'ui.over.continue'));
  parts.push(h('div', { class: 'actions', style: 'justify-content:center' }, btn));
  const el = h('div', { class: 'screen scroll', style: 'justify-content:flex-start;padding-top:6vh' }, h('div', { style: 'max-width:820px;width:100%' }, ...parts));
  void getStats;
  return menuPanel(el, [btn], (e) => { if (e.cmd === 'up' || e.cmd === 'down' || e.code === 'PageUp' || e.code === 'PageDown' || e.code === 'Home' || e.code === 'End') { scrollBody(el, e); return true; } return false; });
};

// ------------------------------------------------------------------ créditos

PANELS.screen_credits = (app: App): Panel => {
  const back = h('button', { class: 'btn primary', onclick: () => app.toScreen(app.meta.stats.runs > 0 ? 'hub' : 'title') }, t('ui.back'));
  const el = h('div', { class: 'screen scroll' },
    h('h2', {}, t('credits.title')),
    h('div', { class: 'credits', style: 'margin:16px 0' }, t('credits.body')),
    h('div', { class: 'actions' }, back));
  app.audio.music?.setTheme('credits');
  return menuPanel(el, [back], (e) => {
    if (e.cmd === 'cancel') { back.click(); return true; }
    if (e.cmd === 'up' || e.cmd === 'down' || e.code === 'PageUp' || e.code === 'PageDown' || e.code === 'Home' || e.code === 'End') { scrollBody(el, e); return true; }
    return false;
  });
};
