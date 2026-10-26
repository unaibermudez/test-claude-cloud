/**
 * Aplicación: máquina de pantallas, bucle de render, enrutado de entrada, puente entre la lógica
 * determinista (core) y la presentación (render, audio, interfaz). Guarda automáticamente.
 */
import type { RunState, RunOptions, Modal } from '../core/state';
import type { GameEvent } from '../core/events';
import type { Action } from '../core/player';
import { rangedInfo, interactTarget, interactCandidates } from '../core/player';
import { step, createRun, defaultOptions } from '../core/game';
import { newMeta, snapshotFor, finishRun, checkAchievements, type MetaState, type RunSummary } from '../core/meta';
import { serializeMeta, deserializeMeta, serializeRun, deserializeRun } from '../core/save';
import { getVision } from '../core/vision';
import { getPlayer, actorAt } from '../core/actors';
import { getStats } from '../core/rules';
import { doorAt, passable, tileAt } from '../core/map';
import { findPath } from '../core/path';
import { line, chebyshev, DIRS } from '../core/geom';
import { TILE } from '../core/state';
import { itemDef } from '../data/items';
import { enemyDef } from '../data/enemies';
import { upgradeDef } from '../data/upgrades';
import { dailySeed } from '../core/rng';
import { t, setLang, setPronoun, setGlobal, tOpt } from '../i18n';
import { load, save, remove, KEYS } from '../platform/storage';
import { loadSettings, saveSettings, type Settings } from '../platform/settings';
import { AudioEngine } from '../audio/audio';
import { WorldRenderer, type Overlay } from '../render/world';
import { lockColor, setLockPalette } from '../render/tiles';
import { Input, DIR_OF, type CommandEvent } from '../input/input';
import { Hud } from '../ui/hud';
import { h, clear, type Panel } from '../ui/dom';
import { HubScene } from '../render/hub';
import { toggleFullscreen } from '../platform/fullscreen';

export type ScreenId = 'boot' | 'warning' | 'title' | 'intro' | 'create' | 'hub' | 'run' | 'over' | 'credits';

export interface Targeting {
  kind: 'fire' | 'throw' | 'look';
  slot?: number;
  x: number;
  y: number;
  cands: { x: number; y: number }[];
  idx: number;
  range: number;
  aoe: number;
}

/** Fábricas de paneles registradas por los módulos de interfaz (evita dependencias circulares). */
export interface PanelFactories {
  [k: string]: (app: App, arg?: unknown) => Panel;
}

export const PANELS: PanelFactories = {};

export class App {
  settings: Settings;
  meta: MetaState;
  run: RunState | null = null;
  audio = new AudioEngine();
  world: WorldRenderer;
  hub: HubScene;
  input: Input;
  hud = new Hud();
  ui: HTMLElement;
  sr: HTMLElement;
  screen: ScreenId = 'boot';
  base: Panel | null = null;
  stack: Panel[] = [];
  targeting: Targeting | null = null;
  hover: { x: number; y: number } | null = null;
  travel: { x: number; y: number }[] | null = null;
  private travelT = 0;
  resting = 0;
  private lastSave = 0;
  private dirty = false;
  runStartMs = 0;
  lastSummary: { summary: RunSummary; achievements: string[]; run: RunState } | null = null;
  private modalKey = '';
  private seenTutorials = new Set<string>();
  private tutorialTurn = -1;
  private raf = 0;
  e2e = false;

  constructor() {
    this.settings = loadSettings();
    this.meta = deserializeMeta(load(KEYS.meta));
    this.ui = document.getElementById('ui')!;
    this.sr = document.getElementById('sr')!;
    const canvas = document.getElementById('world') as HTMLCanvasElement;
    this.world = new WorldRenderer(canvas);
    this.hub = new HubScene(this.world);
    this.input = new Input(this.settings.binds);
    this.input.handler = (e) => this.onCommand(e);
    this.audio.onSubtitle = (key) => { if (this.settings.subtitles && this.screen === 'run') this.hud.subtitle(t(key)); };
    for (const k of Object.keys(this.meta.flags)) if (k.startsWith('tut_')) this.seenTutorials.add(k.slice(4));
    this.applySettings();
    window.addEventListener('resize', () => { this.world.resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flushSave(); });
    window.addEventListener('beforeunload', () => this.flushSave());
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
    window.addEventListener('keydown', () => this.audio.unlock());
    this.bindMouse(canvas);
    const saved = deserializeRun(load(KEYS.run));
    if (saved && !saved.over) this.run = saved;
  }

  // ------------------------------------------------------------------ ajustes

  applySettings(): void {
    const s = this.settings;
    setLang(s.lang);
    document.documentElement.lang = s.lang;
    const fs: Record<string, string> = { s: '13px', m: '15px', l: '17px', xl: '20px' };
    document.documentElement.style.setProperty('--fs', fs[s.textSize] ?? '15px');
    const b = document.body.classList;
    b.toggle('hc', s.highContrast);
    b.toggle('crt', s.crt);
    b.toggle('flicker', !s.reduceFlicker);
    b.toggle('noflicker', s.reduceFlicker);
    b.toggle('noglitch', s.reduceGlitch);
    for (const c of ['cb-deuter', 'cb-protan', 'cb-tritan']) b.remove(c);
    if (s.colorblind !== 'none') b.add(`cb-${s.colorblind}`);
    setLockPalette(s.colorblind);
    this.world.setOpts({ shake: s.reduceShake ? 0 : 1, flicker: !s.reduceFlicker, glitch: !s.reduceGlitch, highContrast: s.highContrast, zoom: s.pixelScale, particles: s.reduceFlicker ? 0.6 : 1 });
    this.hud.glitch = !s.reduceGlitch;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
    this.input.setBinds(s.binds);
  }

  saveSettings(): void {
    saveSettings(this.settings);
    this.applySettings();
  }

  saveMeta(): void {
    save(KEYS.meta, serializeMeta(this.meta));
  }

  // ------------------------------------------------------------------ pantallas y paneles

  setBase(p: Panel | null): void {
    for (const s of this.stack) s.onClose?.();
    this.stack = [];
    clear(this.ui);
    this.base = p;
    if (p) this.ui.append(p.el);
  }

  push(p: Panel): void {
    this.stack.push(p);
    this.ui.append(p.el);
    this.audio.play('menu_select');
  }

  pop(p?: Panel): void {
    const target = p ?? this.stack[this.stack.length - 1];
    if (!target) return;
    const i = this.stack.indexOf(target);
    if (i < 0) return;
    this.stack.splice(i, 1);
    target.el.remove();
    target.onClose?.();
    this.audio.play('menu_move');
  }

  top(): Panel | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  has(id: string): Panel | undefined {
    return this.stack.find((p) => p.id === id);
  }

  open(id: string, arg?: unknown): Panel | null {
    const f = PANELS[id];
    if (!f) return null;
    const p = f(this, arg);
    p.id = p.id ?? id;
    this.push(p);
    return p;
  }

  toScreen(s: ScreenId, arg?: unknown): void {
    this.screen = s;
    this.targeting = null;
    this.travel = null;
    const f = PANELS[`screen_${s}`];
    if (s === 'run') {
      this.setBase(this.gameBase());
      if (this.run) {
        this.hud.lines = [];
        this.hud.bossId = null;
        this.syncRunGlobals();
        this.hud.push(t('ui.resume.line', { zone: t(`zone.${this.run.map.zone}`) }), 'system', this.run.turn);
        this.playMusicFor(this.run);
        this.afterStep([]);
      }
      return;
    }
    if (s === 'hub') {
      this.hub.enter(this);
      this.audio.music?.setTheme('hub');
    }
    this.setBase(f ? f(this, arg) : null);
  }

  private gameBase(): Panel {
    const el = h('div', { class: 'passthrough' }, this.hud.el);
    return { el, onCommand: (e) => this.gameCommand(e) };
  }

  start(): void {
    const loop = (now: number): void => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    if (!this.settings.warningSeen) this.toScreen('warning');
    else this.toScreen('title');
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  // ------------------------------------------------------------------ bucle

  private frame(now: number): void {
    this.input.pollPad(now);
    if (this.screen === 'run' && this.run) {
      const ov: Overlay = {};
      if (this.targeting) {
        const tg = this.targeting;
        const p = getPlayer(this.run);
        ov.cursor = { x: tg.x, y: tg.y };
        ov.mode = tg.kind === 'look' ? 'look' : tg.kind === 'fire' ? 'target' : 'throw';
        ov.aoe = tg.aoe;
        if (tg.kind !== 'look') {
          ov.path = line(p.x, p.y, tg.x, tg.y).slice(1);
          ov.valid = chebyshev(p.x, p.y, tg.x, tg.y) <= tg.range;
        }
      } else if (this.hover) ov.cursor = this.hover;
      this.world.render(this.run, now, ov);
      this.hud.drawAgora(this.run, now);
      this.tickTravel(now);
      if (this.dirty && now - this.lastSave > 1200) this.flushSave();
    } else if (this.screen === 'hub' || this.screen === 'title' || this.screen === 'create' || this.screen === 'credits') {
      this.hub.render(now, this.screen !== 'hub');
    } else {
      const c = this.world.c;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#020306';
      c.fillRect(0, 0, this.world.canvas.width, this.world.canvas.height);
    }
    for (const p of this.stack) (p as Panel & { tick?: (n: number) => void }).tick?.(now);
    (this.base as (Panel & { tick?: (n: number) => void }) | null)?.tick?.(now);
  }

  // ------------------------------------------------------------------ partida

  newRunOptions(partial: Partial<RunOptions>): RunOptions {
    const s = this.settings;
    const mode = partial.mode ?? 'historia';
    let seed = partial.seed ?? '';
    if (mode === 'diario') seed = dailySeed(new Date());
    if (!seed) seed = `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const name = this.meta.profile.name || t('ui.default_name');
    return defaultOptions({
      mode, seed, classId: partial.classId ?? this.meta.profile.lastClass ?? 'tecnico', name: partial.name ?? name,
      pronoun: partial.pronoun ?? this.meta.profile.pronoun ?? 'elle',
      generousO2: s.generousO2, assistHack: s.assistHack, skipHack: s.skipHack, dullEnemies: s.dullEnemies, longOrbit: s.longOrbit,
      startZone: partial.startZone ?? 1,
    });
  }

  startRun(opts: RunOptions): void {
    const perks = this.meta.upgrades.filter((u) => {
      const d = upgradeDef(u);
      if (!d) return false;
      if (d.startZone && d.startZone !== opts.startZone) return false;
      return !(opts.mode === 'pesadilla' && d.branch !== 'acceso');
    });
    this.run = createRun(opts, snapshotFor(this.meta), opts.mode === 'pesadilla' ? [] : perks);
    if (opts.mode === 'diario') this.run.narrative.flags.dateKey = Number(opts.seed.replace(/\D/g, '').slice(0, 8)) || 1;
    this.runStartMs = performance.now();
    this.meta.profile.name = opts.name;
    this.meta.profile.pronoun = opts.pronoun;
    this.saveMeta();
    this.flushSave(true);
    this.toScreen('run');
    if (this.meta.stats.runs === 0) this.tutorial('tut.start');
  }

  syncRunGlobals(): void {
    if (!this.run) return;
    setPronoun(this.run.player.pronoun);
    setGlobal('name', this.run.player.name);
    setGlobal('deaths', this.run.metaSnapshot.deaths);
    setGlobal('survivors', this.run.narrative.survivors);
  }

  playMusicFor(st: RunState): void {
    const m = this.audio.music;
    if (!m) return;
    if (st.map.boss) {
      const boss = st.actors.find((a) => a.boss && !a.dead && enemyDef(a.def).rank === 'boss');
      m.setTheme(boss && st.narrative.flags[`intro_${st.floorNo}`] ? `boss${st.zone}` : `zone${st.zone}`);
    } else m.setTheme(`zone${st.zone}`);
  }

  /** Ejecuta una acción del jugador. */
  act(a: Action): GameEvent[] {
    const st = this.run;
    if (!st || st.over) return [];
    const evs = step(st, a);
    this.afterStep(evs);
    return evs;
  }

  private announce(text: string): void {
    this.sr.textContent = text;
  }

  afterStep(evs: GameEvent[]): void {
    const st = this.run;
    if (!st) return;
    this.syncRunGlobals();
    const now = performance.now();
    this.world.handleEvents(st, evs, now);
    const p = getPlayer(st);
    let interrupt = false;
    for (const e of evs) {
      switch (e.t) {
        case 'msg': {
          const text = t(e.key, e.p ?? {});
          this.hud.push(text, e.tone ?? 'info', st.turn);
          if (e.tone === 'danger' || e.tone === 'agora' || e.tone === 'lore' || e.tone === 'radio') this.announce(text);
          if (e.tone === 'danger' || e.tone === 'warn') interrupt = true;
          break;
        }
        case 'sfx': {
          let pan = 0; let vol = e.vol ?? 1;
          if (e.x !== undefined && e.y !== undefined) {
            pan = Math.max(-1, Math.min(1, (e.x - p.x) / 10));
            const d = chebyshev(e.x, e.y, p.x, p.y);
            vol *= Math.max(0.15, 1 - d / 22);
            if (d > 2 && !getVision(st).visible[e.y * st.map.w + e.x] && e.id !== 'alarm' && e.id !== 'explosion') vol *= 0.6;
          }
          this.audio.play(e.id, pan, vol);
          break;
        }
        case 'music': {
          const m = this.audio.music;
          if (m) {
            if (e.mood === 'boss') m.setTheme(`zone${st.zone}`);
            else m.setTheme(e.mood);
          }
          break;
        }
        case 'subtitle': if (this.settings.subtitles) this.hud.subtitle(t(e.key)); break;
        case 'tutorial': this.tutorial(e.key); break;
        case 'achievement': this.toast(t('ui.achievement'), t(`ach.${e.id}.name`)); break;
        case 'log': {
          const known = this.meta.logs.includes(e.id);
          this.toast(t(known ? 'ui.log.again' : 'ui.log.new'), t(`log.${e.id}.title`));
          if (!this.seenTutorials.has('log')) this.tutorial('tut.log');
          break;
        }
        case 'bossbar': this.hud.bossId = e.actor; break;
        case 'floor': {
          this.hud.bossId = null;
          this.travel = null;
          this.hud.push(`— ${t(`zone.${e.zone}`)} · ${st.map.boss ? t('zone.boss') : t('zone.floor', { f: e.floor })} —`, 'system', st.turn);
          this.dirty = true;
          this.flushSave(true);
          interrupt = true;
          break;
        }
        case 'over': this.onOver(); return;
        case 'dmg': if (e.kind === 'hp' && e.x === p.x && e.y === p.y) interrupt = true; break;
        default: break;
      }
    }
    // música adaptativa
    const m = this.audio.music;
    if (m) {
      const hunting = st.actors.some((a) => !a.dead && a.faction === 'enemy' && a.ai.mode === 'hunt' && chebyshev(a.x, a.y, p.x, p.y) <= 12);
      const alert = st.actors.some((a) => !a.dead && a.faction === 'enemy' && a.ai.mode === 'alert' && chebyshev(a.x, a.y, p.x, p.y) <= 12);
      const target = hunting ? 0.85 : alert ? 0.45 : 0.15 + Math.min(0.3, st.player.noise / 300);
      m.tension = target;
      m.o2Low = st.player.o2 / getStats(st).maxO2 < 0.25;
      m.narrative = st.modal?.kind === 'dialog';
    }
    if (interrupt) { this.travel = null; this.resting = 0; }
    if (this.tutorialTurn >= 0 && st.turn - this.tutorialTurn > 14) { this.hud.hideTutorial(); this.tutorialTurn = -1; }
    // diálogos y modales de la lógica
    this.syncModal();
    this.hud.update(st);
    this.updateHint();
    this.dirty = true;
    if (evs.some((e) => e.t === 'floor')) this.playMusicFor(st);
  }

  /** Abre o cierra el panel que corresponde al modal de la lógica. */
  private syncModal(): void {
    const st = this.run!;
    const md: Modal | null = st.modal;
    const key = md ? `${md.kind}:${'propId' in md ? md.propId : ''}:${md.kind === 'dialog' ? md.scene : ''}` : '';
    const cur = this.stack.find((p) => p.id?.startsWith('modal_'));
    if (key !== this.modalKey) {
      if (cur) this.pop(cur);
      this.modalKey = key;
      if (md) {
        const p = this.open(`modal_${md.kind}`);
        if (!p && md.kind !== 'ending') this.act({ t: 'closeModal' });
      }
    } else if (cur) cur.refresh?.();
  }

  private onOver(): void {
    const st = this.run!;
    remove(KEYS.run);
    const playMs = performance.now() - this.runStartMs;
    const res = finishRun(this.meta, st, playMs);
    for (const k of Object.keys(st.metaSnapshot.flags)) if (k.startsWith('tut_')) this.meta.flags[k] = 1;
    this.saveMeta();
    this.lastSummary = { ...res, run: st };
    this.run = null;
    this.dirty = false;
    const music = this.audio.music;
    const ending = st.over?.ending;
    if (music) music.setTheme(ending && st.over?.victory ? `end_${ending}` : 'end_death');
    setTimeout(() => this.toScreen('over'), st.over?.victory ? 400 : 1300);
  }

  flushSave(force = false): void {
    if (!this.run || this.run.over) return;
    if (!this.dirty && !force) return;
    save(KEYS.run, serializeRun(this.run));
    this.dirty = false;
    this.lastSave = performance.now();
  }

  /** Guardar y salir al título (la partida sigue en curso). */
  saveAndQuit(): void {
    this.flushSave(true);
    this.run = null;
    this.toScreen('title');
  }

  /** Abandonar: cuenta como muerte. */
  abandon(): void {
    const st = this.run;
    if (!st) return;
    st.over = { cause: 'abandon', ending: null, victory: false };
    this.onOver();
  }

  tutorial(key: string): void {
    if (!this.settings.showTutorial) return;
    const id = key.replace(/^tut\./, '');
    if (this.seenTutorials.has(id)) return;
    this.seenTutorials.add(id);
    this.meta.flags[`tut_${id}`] = 1;
    const title = tOpt(`${key}.title`) || t('ui.tutorial');
    this.hud.showTutorial(title, t(key));
    this.tutorialTurn = this.run?.turn ?? 0;
  }

  toast(title: string, body: string): void {
    const el = h('div', { class: 'toast' }, h('div', {}, h('div', { class: 't1' }, title), h('div', {}, body)));
    this.ui.append(el);
    this.announce(`${title}: ${body}`);
    setTimeout(() => el.remove(), 3200);
  }

  // ------------------------------------------------------------------ controles de juego

  private gameCommand(e: CommandEvent): boolean {
    const st = this.run;
    if (!st || st.over) return false;
    if (this.targeting) return this.targetCommand(e);
    if ((e.cmd === 'cancel' || e.cmd === 'pause') && this.hud.hideTutorial()) return true;
    const dir = DIR_OF[e.cmd];
    if (dir !== undefined) {
      this.travel = null;
      if (e.shift) this.act({ t: 'shove', dir });
      else this.act({ t: 'move', dir });
      return true;
    }
    switch (e.cmd) {
      case 'wait': this.act({ t: 'wait' }); return true;
      case 'interact': this.interact(); return true;
      case 'fire': this.startTargeting('fire'); return true;
      case 'throw': this.open('inventory', { filter: 'gadget' }); return true;
      case 'pickup': this.act({ t: 'pickup' }); return true;
      case 'sneak': this.act({ t: 'toggleSneak' }); return true;
      case 'light': this.act({ t: 'toggleLight' }); return true;
      case 'inventory': this.open('inventory'); return true;
      case 'implants': this.open('implants'); return true;
      case 'map': this.open('map'); return true;
      case 'archive': this.open('archive'); return true;
      case 'agora': this.open('agora'); return true;
      case 'active': this.act({ t: 'active' }); return true;
      case 'rest': this.startRest(); return true;
      case 'help': this.open('help'); return true;
      case 'look': this.startTargeting('look'); return true;
      case 'pause': case 'cancel': this.open('pause'); return true;
      case 'num': if (e.num !== undefined) this.quickUse(e.num); return true;
      default: return false;
    }
  }

  private quickUse(n: number): void {
    const st = this.run!;
    const slot = n === 0 ? 9 : n - 1;
    const s = st.player.inv[slot];
    if (!s) return;
    const d = itemDef(s.id);
    if (d.type === 'gadget') this.startTargeting('throw', slot);
    else if (d.type === 'weapon') this.act({ t: 'equip', slot });
    else this.act({ t: 'use', slot });
  }

  private interact(): void {
    const st = this.run!;
    const p = getPlayer(st);
    const cands = interactCandidates(st);
    if (cands.length > 1 && new Set(cands.map((c) => c.prop.id)).size > 1) { this.open('interactMenu', cands); return; }
    if (cands.length === 1) { this.act(cands[0].dir >= 0 ? { t: 'interact', dir: cands[0].dir } : { t: 'interact' }); return; }
    // puertas adyacentes: menú contextual
    const doors: { x: number; y: number }[] = [];
    for (const d of DIRS) {
      const x = p.x + d.x; const y = p.y + d.y;
      if (doorAt(st.map, x, y)) doors.push({ x, y });
    }
    if (doors.length) { this.open('doorMenu', doors); return; }
    if (st.items.some((it) => it.x === p.x && it.y === p.y)) { this.act({ t: 'pickup' }); return; }
    this.act({ t: 'interact' });
  }

  startRest(): void {
    const st = this.run!;
    const v = getVision(st);
    if (st.actors.some((a) => !a.dead && a.faction === 'enemy' && v.seenActors.has(a.id) && !a.phantom)) {
      this.hud.push(t('ui.rest.enemies'), 'warn', st.turn);
      this.hud.update(st);
      return;
    }
    this.resting = 40;
    this.hud.push(t('ui.rest.start'), 'system', st.turn);
    const tick = (): void => {
      const s = this.run;
      if (!s || s.over || this.resting <= 0 || s.modal) { this.resting = 0; return; }
      const p = getPlayer(s);
      if (p.hp >= p.maxHp && s.player.energy >= getStats(s).maxEnergy) { this.resting = 0; this.hud.push(t('ui.rest.done'), 'system', s.turn); this.hud.update(s); return; }
      const before = new Set(getVision(s).seenActors);
      this.resting--;
      this.act({ t: 'wait' });
      const now = getVision(s).seenActors;
      for (const id of now) if (!before.has(id)) { const a = s.actors.find((q) => q.id === id); if (a && a.faction === 'enemy') { this.resting = 0; this.hud.push(t('ui.rest.interrupted'), 'warn', s.turn); this.hud.update(s); } }
      if (this.resting > 0) setTimeout(tick, 35);
    };
    tick();
  }

  // ------------------------------------------------------------------ apuntado

  startTargeting(kind: Targeting['kind'], slot?: number): void {
    const st = this.run!;
    const p = getPlayer(st);
    let range = 12; let aoe = 0;
    if (kind === 'fire') {
      const info = rangedInfo(st);
      if (!info.ok) {
        this.hud.push(t(info.reason ?? 'msg.no_ranged'), 'warn', st.turn);
        this.hud.update(st);
        return;
      }
      range = info.range;
    } else if (kind === 'throw' && slot !== undefined) {
      const d = itemDef(st.player.inv[slot]?.id ?? '');
      range = d.gadget?.range ?? 6;
      aoe = d.gadget?.radius ?? 0;
      if (d.gadget?.kind === 'sealer' || d.gadget?.kind === 'drone' || d.gadget?.kind === 'charge' || d.gadget?.kind === 'mine') {
        // se usan en el sitio: apuntado de alcance 1
        range = Math.max(1, d.gadget.range);
      }
    }
    const v = getVision(st);
    const cands = st.actors
      .filter((a) => !a.dead && a.id !== st.pid && a.faction === 'enemy' && v.seenActors.has(a.id))
      .sort((a, b) => chebyshev(a.x, a.y, p.x, p.y) - chebyshev(b.x, b.y, p.x, p.y))
      .map((a) => ({ x: a.x, y: a.y }));
    const first = cands.find((c) => chebyshev(c.x, c.y, p.x, p.y) <= range) ?? cands[0];
    this.targeting = { kind, slot, x: first?.x ?? p.x, y: first?.y ?? p.y, cands, idx: 0, range, aoe };
    if (kind !== 'look' && !first) {
      const d = DIRS[p.facing];
      this.targeting.x = p.x + d.x * Math.min(3, range);
      this.targeting.y = p.y + d.y * Math.min(3, range);
    }
    this.updateHint();
  }

  private targetCommand(e: CommandEvent): boolean {
    const tg = this.targeting!;
    const dir = DIR_OF[e.cmd];
    if (dir !== undefined) {
      const st = this.run!;
      tg.x = Math.max(0, Math.min(st.map.w - 1, tg.x + DIRS[dir].x));
      tg.y = Math.max(0, Math.min(st.map.h - 1, tg.y + DIRS[dir].y));
      this.updateHint();
      return true;
    }
    switch (e.cmd) {
      case 'next': case 'prev': case 'inventory': {
        if (!tg.cands.length) return true;
        tg.idx = (tg.idx + (e.cmd === 'prev' ? -1 : 1) + tg.cands.length) % tg.cands.length;
        tg.x = tg.cands[tg.idx].x; tg.y = tg.cands[tg.idx].y;
        this.updateHint();
        return true;
      }
      case 'confirm': case 'interact': case 'fire': case 'throw': this.confirmTarget(); return true;
      case 'cancel': case 'pause': case 'look': this.targeting = null; this.updateHint(); return true;
      default: return true;
    }
  }

  confirmTarget(): void {
    const tg = this.targeting;
    const st = this.run;
    if (!tg || !st) return;
    this.targeting = null;
    if (tg.kind === 'fire') this.act({ t: 'fire', x: tg.x, y: tg.y });
    else if (tg.kind === 'throw' && tg.slot !== undefined) this.act({ t: 'throw', slot: tg.slot, x: tg.x, y: tg.y });
    this.updateHint();
  }

  // ------------------------------------------------------------------ descripción de casillas

  describe(x: number, y: number): string {
    const st = this.run;
    if (!st) return '';
    const m = st.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return '';
    const i = y * m.w + x;
    const v = getVision(st);
    if (!m.seen[i] && !v.visible[i]) return t('ui.look.unknown');
    const parts: string[] = [];
    const a = actorAt(st, x, y);
    if (a && (a.id === st.pid || v.seenActors.has(a.id))) {
      if (a.id === st.pid) parts.push(t('ui.look.you'));
      else if (a.npc) parts.push(t(`npc.${a.npc}.name`));
      else {
        const d = enemyDef(a.def);
        let s = t(`enemy.${a.def}.name`);
        if (a.elite) s = `${t(`elite.${a.elite}`)} ${s}`;
        const hpk = a.hp / a.maxHp;
        s += ` · ${t(hpk > 0.75 ? 'ui.look.healthy' : hpk > 0.4 ? 'ui.look.hurt' : 'ui.look.dying')}`;
        s += ` · ${t(`ui.ai.${a.ai.mode}`)}`;
        if (a.faction === 'ally') s += ` · ${t('ui.look.ally')}`;
        if (d.rank) s += ` · ${t(`ui.rank.${d.rank}`)}`;
        parts.push(s);
      }
    }
    for (const it of st.items) if (it.x === x && it.y === y) { const k = (st.known[it.item.id] || !itemDef(it.item.id).unknown) ? `item.${it.item.id}.name` : null; parts.push(k ? t(k) + (it.item.n > 1 ? ` ×${it.item.n}` : '') : t('ui.look.unknown_item')); }
    for (const p of m.props) {
      if (p.x !== x || p.y !== y) continue;
      if (p.kind === 'decor' || (p.kind === 'corpse' && p.label)) parts.push(t(`ui.decor.${p.label}`));
      else if (p.kind === 'npc' && p.npc) parts.push(t(`npc.${p.npc}.name`));
      else if (p.kind === 'keycard' && p.used) continue;
      else if (p.kind === 'log' && p.used) continue;
      else parts.push(t(`ui.prop.${p.kind}`) + (p.used && (p.kind === 'container' || p.kind === 'o2station' || p.kind === 'powernode') ? ` (${t('ui.used')})` : ''));
    }
    const tile = tileAt(m, x, y);
    const door = doorAt(m, x, y);
    if (door) {
      let s = t('ui.tile.door');
      if (door.broken) s += ` (${t('ui.door.broken')})`;
      else if (door.sealed) s += ` (${t('ui.door.sealed')})`;
      else if (door.lock) s += ` (${t('ui.door.locked', { k: t(`key.${door.lock}`) })})`;
      else s += ` (${t(door.open ? 'ui.door.open' : 'ui.door.closed')})`;
      parts.push(s);
    } else if (!parts.length || tile !== TILE.FLOOR) parts.push(t(`ui.tile.${tile}`));
    if (m.fire[i] > 0) parts.push(t('ui.room.fire'));
    if (m.gas[i] > 0) parts.push(t('ui.look.gas'));
    const s = m.sec[i] >= 0 ? m.sections[m.sec[i]] : null;
    if (s) {
      if (s.pressure < 30 && m.zone !== 6) parts.push(t('ui.room.vacuum'));
      if (s.radiation > 0) parts.push(t('ui.room.radiation'));
    }
    if (!v.visible[i]) parts.push(t('ui.look.memory'));
    void lockColor;
    return parts.join(' · ');
  }

  updateHint(): void {
    const st = this.run;
    if (!st || this.screen !== 'run') return;
    const tg = this.targeting;
    if (tg) {
      const k = tg.kind === 'look' ? 'ui.hint.look' : tg.kind === 'fire' ? 'ui.hint.fire' : 'ui.hint.throw';
      this.hud.setHint(`${t(k)} · ${this.describe(tg.x, tg.y)}`);
      return;
    }
    const prop = interactTarget(st);
    if (prop) {
      const nm = prop.kind === 'npc' && prop.npc ? t(`npc.${prop.npc}.name`) : prop.kind === 'decor' ? t(`ui.decor.${prop.label}`) : t(`ui.prop.${prop.kind}`);
      this.hud.setHint(t('ui.hint.interact', { k: this.input.label('interact'), what: nm }));
      return;
    }
    const p = getPlayer(st);
    const here = st.items.filter((it) => it.x === p.x && it.y === p.y);
    if (here.length) { this.hud.setHint(t('ui.hint.pickup', { k: this.input.label('pickup') })); return; }
    if (this.hover) { this.hud.setHint(this.describe(this.hover.x, this.hover.y)); return; }
    this.hud.setHint(null);
  }

  // ------------------------------------------------------------------ ratón y viaje

  private bindMouse(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousemove', (e) => {
      if (this.screen !== 'run' || !this.run) return;
      const tl = this.world.screenToTile(e.clientX, e.clientY);
      if (this.targeting) { this.targeting.x = tl.x; this.targeting.y = tl.y; }
      else this.hover = tl;
      this.updateHint();
    });
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.updateHint(); });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.screen !== 'run' || !this.run) return;
      if (this.targeting) { this.targeting = null; this.updateHint(); return; }
      const tl = this.world.screenToTile(e.clientX, e.clientY);
      this.hud.push(this.describe(tl.x, tl.y), 'system', this.run.turn);
      this.hud.update(this.run);
    });
    canvas.addEventListener('click', (e) => {
      if (this.screen === 'hub') { this.hub.click(this, e.clientX, e.clientY); return; }
      if (this.screen !== 'run' || !this.run || this.stack.length) return;
      const st = this.run;
      const tl = this.world.screenToTile(e.clientX, e.clientY);
      if (this.targeting) { this.targeting.x = tl.x; this.targeting.y = tl.y; this.confirmTarget(); return; }
      const p = getPlayer(st);
      const dx = tl.x - p.x; const dy = tl.y - p.y;
      const v = getVision(st);
      const target = actorAt(st, tl.x, tl.y);
      if (target && target.faction === 'enemy' && v.seenActors.has(target.id) && chebyshev(dx, dy, 0, 0) > 1 && (e.shiftKey || st.player.ranged)) {
        const info = rangedInfo(st);
        if (info.ok) { this.act({ t: 'fire', x: tl.x, y: tl.y }); return; }
      }
      if (dx === 0 && dy === 0) { this.interact(); return; }
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        const dir = DIRS.findIndex((d) => d.x === dx && d.y === dy);
        this.act({ t: e.shiftKey ? 'shove' : 'move', dir });
        return;
      }
      // viaje por casillas conocidas
      const m = st.map;
      const cost = (x: number, y: number): number => {
        const i = y * m.w + x;
        if (!m.seen[i] && !v.visible[i]) return -1;
        if (!passable(m, x, y, { allowVoid: m.zone === 6 && st.player.suit })) {
          const d = doorAt(m, x, y);
          if (!(d && !d.sealed && !d.lock)) return -1;
        }
        if (m.fire[i] > 0) return 8;
        return 1;
      };
      const path = findPath(m.w, m.h, p.x, p.y, tl.x, tl.y, cost, 6000, true);
      if (path && path.length > 0) { this.travel = path; this.travelT = 0; }
    });
    canvas.addEventListener('wheel', (e) => {
      if (this.screen !== 'run') return;
      const z = Math.max(1, Math.min(6, (this.settings.pixelScale || this.world.scale) + (e.deltaY < 0 ? 1 : -1)));
      this.settings.pixelScale = z;
      this.saveSettings();
    }, { passive: true });
  }

  private tickTravel(now: number): void {
    if (!this.travel || !this.run || this.stack.length || this.run.modal) { if (this.travel && this.run?.modal) this.travel = null; return; }
    if (now - this.travelT < 70) return;
    this.travelT = now;
    const st = this.run;
    const p = getPlayer(st);
    const nxt = this.travel.shift();
    if (!nxt) { this.travel = null; return; }
    const dx = nxt.x - p.x; const dy = nxt.y - p.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { this.travel = null; return; }
    const before = new Set(getVision(st).seenActors);
    const dir = DIRS.findIndex((d) => d.x === dx && d.y === dy);
    this.act({ t: 'move', dir });
    for (const id of getVision(st).seenActors) {
      if (before.has(id)) continue;
      const a = st.actors.find((q) => q.id === id);
      if (a && a.faction === 'enemy') { this.travel = null; break; }
    }
    if (this.travel && this.travel.length === 0) this.travel = null;
  }

  // ------------------------------------------------------------------ meta

  resetMeta(): void {
    this.meta = newMeta();
    this.saveMeta();
    remove(KEYS.run);
    this.run = null;
  }

  checkMetaAchievements(): void {
    const got = checkAchievements(this.meta);
    if (got.length) { for (const a of got) this.toast(t('ui.achievement'), t(`ach.${a}.name`)); this.saveMeta(); }
  }

  /** Enrutado general de comandos: tutorial → panel superior → base. */
  private onCommand(e: CommandEvent): boolean {
    if (e.cmd === 'fullscreen') { toggleFullscreen(); return true; }
    const top = this.top();
    if (top?.onCommand) {
      const r = top.onCommand(e);
      if (r !== false || !top.passthrough) return true;
    }
    if (this.base?.onCommand) return this.base.onCommand(e) !== false;
    return false;
  }
}
