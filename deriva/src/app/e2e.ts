/**
 * Ganchos para pruebas automáticas (solo con `?e2e` en la URL). Permiten a Playwright
 * inspeccionar el estado y saltar a escenarios concretos sin jugar una partida entera.
 */
import type { App } from './app';
import { debugWarp } from '../core/game';
import { getPlayer, freeSpotNear } from '../core/actors';
import { invalidateVision } from '../core/vision';
import type { Action } from '../core/player';
import { botDecide, newBotMemory } from '../sim/bot';

export interface E2EApi {
  app: App;
  screen(): string;
  summary(): Record<string, unknown> | null;
  act(a: Action): number;
  warp(zone: number, floor: number): void;
  toCore(): boolean;
  godMode(): void;
  panels(): string[];
  bot(n: number): number;
}

export function installE2E(app: App): void {
  app.e2e = true;
  const mem = newBotMemory();
  let god = false;
  const api: E2EApi = {
    app,
    screen: () => app.screen,
    summary: () => {
      const st = app.run;
      if (!st) return null;
      const p = getPlayer(st);
      return { zone: st.map.zone, floor: st.map.floor, turn: st.turn, hp: p.hp, x: p.x, y: p.y, o2: st.player.o2, inv: st.player.inv.length, modal: st.modal?.kind ?? null, over: !!st.over };
    },
    act: (a) => app.act(a).length,
    warp: (zone, floor) => {
      const st = app.run;
      if (!st) return;
      const evs = debugWarp(st, zone as 1, floor);
      app.afterStep(evs);
    },
    toCore: () => {
      const st = app.run;
      if (!st) return false;
      if (!(st.map.zone === 5 && st.map.floor === 4)) app.afterStep(debugWarp(st, 5, 4));
      const core = st.map.props.find((q) => q.kind === 'core');
      if (!core) return false;
      const p = getPlayer(st);
      for (const a of st.actors) if (a.id !== st.pid && a.faction === 'enemy') a.dead = true;
      st.actors = st.actors.filter((a) => !a.dead || a.id === st.pid);
      const spot = freeSpotNear(st, core.x, core.y, 2);
      if (!spot) return false;
      p.x = spot.x; p.y = spot.y;
      for (let i = 0; i < st.map.seen.length; i++) st.map.seen[i] = 1;
      invalidateVision(st);
      app.afterStep([]);
      return true;
    },
    godMode: () => {
      const st = app.run;
      if (!st) return;
      god = true;
      void st;
    },
    panels: () => app.stack.map((p) => p.id ?? '?'),
    bot: (n) => {
      let k = 0;
      for (; k < n; k++) {
        const st = app.run;
        if (!st || st.over) break;
        if (god) { const p = getPlayer(st); p.hp = p.maxHp; st.player.o2 = Math.max(st.player.o2, 50); }
        app.act(botDecide(st, 'prudente', mem));
      }
      return k;
    },
  };
  (window as unknown as { __deriva: E2EApi }).__deriva = api;
}
