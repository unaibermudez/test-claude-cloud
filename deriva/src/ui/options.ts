/** Opciones: audio, idioma, accesibilidad, ayudas de dificultad, controles y datos (exportar/importar). */
import { App, PANELS } from '../app/app';
import { h, clear, panelShell, type Panel } from './dom';
import { t, LANGS, type Lang } from '../i18n';
import { DEFAULT_BINDS, type Settings, type Colorblind, type TextSize } from '../platform/settings';
import { exportAll, importAll } from '../core/save';
import { save, KEYS, remove } from '../platform/storage';
import { serializeRun } from '../core/save';
import { toggleFullscreen } from '../platform/fullscreen';

type Tab = 'audio' | 'access' | 'game' | 'controls' | 'data';
const TABS: Tab[] = ['audio', 'access', 'game', 'controls', 'data'];

PANELS.options = (app: App, arg?: unknown): Panel => {
  let tab: Tab = (arg as { tab?: Tab } | undefined)?.tab ?? 'audio';
  let sel = 0;
  const tabs = h('div', { class: 'tabs' });
  const shell = panelShell(t('ui.title.options'), { cls: 'wide', tabs, onClose: () => app.pop(p) });
  const s = app.settings;
  const rows: { el: HTMLElement; adjust?: (d: number) => void; activate?: () => void }[] = [];
  const apply = (): void => { app.saveSettings(); };
  const row = (label: string, control: HTMLElement, desc?: string, adjust?: (d: number) => void, activate?: () => void): void => {
    const el = h('div', { class: 'opt-row' }, h('div', { class: 'lbl' }, label, desc ? h('small', {}, desc) : null), control);
    rows.push({ el, adjust, activate });
    shell.body.append(el);
  };
  const slider = (key: 'master' | 'music' | 'sfx'): void => {
    const inp = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100) }) as HTMLInputElement;
    inp.addEventListener('input', () => { s[key] = Number(inp.value) / 100; apply(); });
    row(t(`ui.opt.${key}`), inp, undefined, (d) => { s[key] = Math.max(0, Math.min(1, Math.round((s[key] + d * 0.1) * 10) / 10)); inp.value = String(Math.round(s[key] * 100)); apply(); });
  };
  type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
  const toggle = (key: BoolKey, desc = true): void => {
    const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
    cb.checked = s[key] as boolean;
    const flip = (): void => { (s[key] as boolean) = !(s[key] as boolean); cb.checked = s[key] as boolean; apply(); };
    cb.addEventListener('change', () => { (s[key] as boolean) = cb.checked; apply(); });
    row(t(`ui.opt.${key}`), cb, desc ? t(`ui.opt.${key}.desc`) : undefined, () => flip(), flip);
  };
  const choice = <T extends string>(label: string, values: T[], get: () => T, set: (v: T) => void, name: (v: T) => string): void => {
    const sel2 = h('select') as HTMLSelectElement;
    for (const v of values) sel2.append(h('option', { value: v, selected: get() === v }, name(v)));
    sel2.addEventListener('change', () => { set(sel2.value as T); apply(); render(); });
    row(label, sel2, undefined, (d) => { const i = values.indexOf(get()); set(values[(i + d + values.length) % values.length]); apply(); render(); });
  };
  const render = (): void => {
    clear(tabs);
    for (const k of TABS) tabs.append(h('button', { class: `tab${k === tab ? ' on' : ''}`, onclick: () => { tab = k; sel = 0; render(); } }, t(`ui.opt.tab.${k}`)));
    clear(shell.body);
    rows.length = 0;
    if (tab === 'audio') {
      slider('master'); slider('music'); slider('sfx');
      toggle('muted', false); toggle('subtitles');
      choice(t('ui.opt.lang'), LANGS as Lang[], () => s.lang, (v) => { s.lang = v; }, (v) => (v === 'es' ? 'Español' : 'English'));
    } else if (tab === 'access') {
      choice(t('ui.opt.textSize'), ['s', 'm', 'l', 'xl'] as TextSize[], () => s.textSize, (v) => { s.textSize = v; }, (v) => t(`ui.opt.size.${v}`));
      toggle('highContrast');
      choice(t('ui.opt.colorblind'), ['none', 'deuter', 'protan', 'tritan'] as Colorblind[], () => s.colorblind, (v) => { s.colorblind = v; app.world.invalidateLayer(); }, (v) => t(`ui.opt.cb.${v}`));
      toggle('reduceFlicker'); toggle('reduceShake'); toggle('reduceGlitch'); toggle('crt');
      choice(t('ui.opt.pixelScale'), ['0', '1', '2', '3', '4', '5'], () => String(s.pixelScale), (v) => { s.pixelScale = Number(v); }, (v) => (v === '0' ? t('ui.opt.auto') : `×${v}`));
      toggle('showTutorial');
      const fsBtn = h('button', { class: 'btn', onclick: () => toggleFullscreen() }, t(document.fullscreenElement ? 'ui.opt.fullscreen_off' : 'ui.opt.fullscreen_on'));
      row(t('ui.opt.fullscreen'), fsBtn, t('ui.opt.fullscreen.desc'), undefined, () => fsBtn.click());
    } else if (tab === 'game') {
      shell.body.append(h('p', { class: 'dim' }, t('ui.opt.game_note')));
      toggle('generousO2'); toggle('assistHack'); toggle('skipHack'); toggle('dullEnemies'); toggle('longOrbit');
    } else if (tab === 'controls') {
      shell.body.append(h('p', { class: 'dim' }, t('ui.opt.binds_note')));
      for (const cmd of Object.keys(DEFAULT_BINDS)) {
        const keys = s.binds[cmd] ?? [];
        const btn = h('button', { class: 'btn' }, keys.map((k) => app.input.keyName(k)).join(' · ') || '—');
        const rebind = (): void => {
          btn.textContent = t('ui.opt.press_key');
          app.input.capture = (code) => {
            if (code !== 'Escape') {
              for (const [c, ks] of Object.entries(s.binds)) s.binds[c] = ks.filter((k) => k !== code);
              s.binds[cmd] = [code, ...(s.binds[cmd] ?? []).filter((k) => k !== code)].slice(0, 3);
              apply();
            }
            render();
          };
        };
        btn.addEventListener('click', rebind);
        row(t(`ui.cmd.${cmd}`), btn, undefined, undefined, rebind);
      }
      const reset = h('button', { class: 'btn danger', onclick: () => { s.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)) as Record<string, string[]>; apply(); render(); } }, t('ui.opt.reset_binds'));
      row(t('ui.opt.reset_binds'), reset, undefined, undefined, () => reset.click());
    } else {
      const status = h('p', { class: 'dim' });
      const exp = h('button', { class: 'btn', onclick: () => {
        if (app.run) save(KEYS.run, serializeRun(app.run));
        const data = exportAll(app.meta, app.run);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `deriva-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        status.textContent = t('ui.data.exported');
      } }, t('ui.data.export'));
      const file = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;
      file.addEventListener('change', () => {
        const f = file.files?.[0];
        if (!f) return;
        void f.text().then((txt) => {
          try {
            const r = importAll(txt);
            app.meta = r.meta;
            app.saveMeta();
            if (r.run) { app.run = r.run; save(KEYS.run, serializeRun(r.run)); } else { app.run = null; remove(KEYS.run); }
            status.textContent = t('ui.data.imported');
          } catch {
            status.textContent = t('ui.data.import_error');
          }
        });
      });
      const imp = h('button', { class: 'btn', onclick: () => file.click() }, t('ui.data.import'));
      let armed = false;
      const wipe = h('button', { class: 'btn danger', onclick: () => {
        if (!armed) { armed = true; wipe.textContent = t('ui.data.wipe_confirm'); return; }
        app.resetMeta();
        status.textContent = t('ui.data.wiped');
        armed = false;
        wipe.textContent = t('ui.data.wipe');
      } }, t('ui.data.wipe'));
      row(t('ui.data.export'), exp, t('ui.data.export_desc'), undefined, () => exp.click());
      row(t('ui.data.import'), imp, t('ui.data.import_desc'), undefined, () => imp.click());
      row(t('ui.data.wipe'), wipe, t('ui.data.wipe_desc'), undefined, () => wipe.click());
      shell.body.append(file, status);
    }
    sel = Math.min(sel, rows.length - 1);
    rows.forEach((r, i) => r.el.classList.toggle('sel', i === sel));
  };
  render();
  shell.footer.append(h('span', {}, t('ui.opt.footer')));
  const p: Panel = {
    el: shell.root,
    onCommand: (e) => {
      if (e.cmd === 'cancel' || e.cmd === 'pause') { app.pop(p); return true; }
      if (e.cmd === 'next' || e.cmd === 'prev') { const i = TABS.indexOf(tab); tab = TABS[(i + (e.cmd === 'next' ? 1 : -1) + TABS.length) % TABS.length]; sel = 0; render(); return true; }
      if (e.cmd === 'up' || e.cmd === 'down') { sel = (sel + (e.cmd === 'up' ? -1 : 1) + rows.length) % rows.length; rows.forEach((r, i) => r.el.classList.toggle('sel', i === sel)); rows[sel]?.el.scrollIntoView({ block: 'nearest' }); return true; }
      if (e.cmd === 'left' || e.cmd === 'right') { rows[sel]?.adjust?.(e.cmd === 'left' ? -1 : 1); if (tab !== 'audio' || sel > 2) render(); return true; }
      if (e.cmd === 'confirm' || e.cmd === 'interact') { rows[sel]?.activate?.(); return true; }
      return true;
    },
  };
  return p;
};
