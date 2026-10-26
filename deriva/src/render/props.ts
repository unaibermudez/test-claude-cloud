/**
 * Objetos del escenario (terminales, estaciones de O₂, cápsulas, barriles, decorado…).
 * Se pintan cada fotograma con rectángulos; las luces parpadean con el tiempo `t` (ms).
 */
import type { Prop } from '../core/state';
import type { ZonePalette } from '../core/content';
import { shadeHex } from './pixel';
import { lockColor, TS } from './tiles';
import { personSprite, NPC_LOOK } from './sprites';

type Ctx = CanvasRenderingContext2D;

function R(c: Ctx, col: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

function blink(t: number, period: number, phase = 0): boolean {
  return Math.floor((t + phase) / period) % 2 === 0;
}

function shadow(c: Ctx, x: number, y: number, w: number): void {
  R(c, 'rgba(0,0,0,0.35)', x + (TS - w) / 2, y + 14, w, 2);
}

function screen(c: Ctx, x: number, y: number, w: number, h: number, col: string, t: number, off: boolean): void {
  R(c, '#050709', x, y, w, h);
  if (off) return;
  R(c, shadeHex(col, -0.45), x + 1, y + 1, w - 2, h - 2);
  const line = Math.floor(t / 180) % Math.max(1, h - 2);
  R(c, col, x + 1, y + 1 + line, w - 2, 1);
  R(c, shadeHex(col, 0.3), x + 2, y + 2, Math.max(1, Math.floor((w - 4) * 0.6)), 1);
}

function drawDecor(c: Ctx, p: Prop, x: number, y: number, pal: ZonePalette, t: number): void {
  const w0 = pal.wall[0]; const w1 = pal.wall[1]; const w2 = pal.wall[2]; const acc = pal.accent;
  const v = p.variant ?? 0;
  switch (p.label) {
    case 'bed': shadow(c, x, y, 14); R(c, w2, x + 1, y + 4, 14, 10); R(c, '#c9ccd4', x + 2, y + 4, 12, 7); R(c, '#e8ebf0', x + 2, y + 4, 4, 4); R(c, shadeHex(acc, -0.3), x + 7, y + 7, 7, 4); break;
    case 'table': case 'map_table': shadow(c, x, y, 14); R(c, w1, x + 1, y + 5, 14, 6); R(c, w2, x + 2, y + 11, 2, 3); R(c, w2, x + 12, y + 11, 2, 3);
      if (p.label === 'map_table') { R(c, '#0b1830', x + 2, y + 6, 12, 4); R(c, acc, x + 5 + (Math.floor(t / 400) % 5), y + 7, 1, 1); }
      else if (v === 1) R(c, '#d8d0b8', x + 4, y + 6, 4, 2);
      break;
    case 'locker': shadow(c, x, y, 10); R(c, w0, x + 3, y + 1, 10, 14); R(c, w1, x + 3, y + 1, 10, 1); R(c, w2, x + 8, y + 2, 1, 13); R(c, w2, x + 5, y + 4, 2, 1); R(c, w2, x + 10, y + 4, 2, 1); break;
    case 'toy': R(c, '#e85a5a', x + 6, y + 9, 4, 4); R(c, '#f2d45c', x + 7, y + 7, 2, 2); R(c, '#111', x + 7, y + 10, 1, 1); break;
    case 'plant_pot': case 'planter': shadow(c, x, y, 10); R(c, '#7a4a2a', x + 4, y + 9, 8, 5); R(c, '#5a361f', x + 4, y + 9, 8, 1);
      R(c, '#5aa04a', x + 5, y + 4, 2, 5); R(c, '#7ac85a', x + 8, y + 3, 2, 6); R(c, '#4a8a3a', x + 10, y + 6, 1, 3); break;
    case 'chair': R(c, w1, x + 5, y + 4, 6, 2); R(c, w0, x + 5, y + 6, 6, 4); R(c, w2, x + 5, y + 10, 1, 4); R(c, w2, x + 10, y + 10, 1, 4); break;
    case 'shelf': shadow(c, x, y, 14); R(c, w2, x + 1, y + 1, 14, 14); for (let k = 0; k < 3; k++) { R(c, w1, x + 1, y + 4 + k * 4, 14, 1); R(c, k === v ? acc : '#9a8a6a', x + 3 + k * 3, y + 2 + k * 4, 3, 2); } break;
    case 'cryopod_off': shadow(c, x, y, 12); R(c, w2, x + 2, y + 1, 12, 14); R(c, '#1a2a38', x + 4, y + 3, 8, 9); R(c, '#2a3a48', x + 4, y + 3, 8, 2); break;
    case 'hydro_tank': R(c, w2, x + 2, y + 2, 12, 12); R(c, '#2a6a4a', x + 3, y + 4, 10, 9); R(c, acc, x + 4 + (Math.floor(t / 300) % 8), y + 6 + (Math.floor(t / 500) % 5), 1, 1); R(c, w1, x + 2, y + 2, 12, 2); break;
    case 'roots': for (let k = 0; k < 4; k++) R(c, k % 2 ? '#6a4a2a' : '#8a6a3a', x + 1 + k * 4, y + 6 + (k % 3), 3, 8 - (k % 3)); break;
    case 'fungus': R(c, '#c8a0d8', x + 4, y + 6, 6, 3); R(c, '#e8d0f0', x + 5, y + 6, 4, 1); R(c, '#a080b0', x + 6, y + 9, 2, 4); R(c, acc, x + 10, y + 10, 3, 2); break;
    case 'pipes': R(c, w2, x, y + 3, TS, 4); R(c, w1, x, y + 3, TS, 1); R(c, w2, x, y + 9, TS, 3); R(c, '#c46a2f', x + 6, y + 2, 3, 6); break;
    case 'generator': shadow(c, x, y, 14); R(c, w0, x + 1, y + 3, 14, 11); R(c, w2, x + 3, y + 5, 10, 6); R(c, blink(t, 300) ? acc : shadeHex(acc, -0.5), x + 12, y + 4, 2, 2); for (let k = 0; k < 4; k++) R(c, w1, x + 4 + k * 2, y + 6, 1, 4); break;
    case 'crate': shadow(c, x, y, 12); R(c, '#8a6a3a', x + 2, y + 4, 12, 10); R(c, '#6a4a2a', x + 2, y + 8, 12, 1); R(c, '#a8854a', x + 2, y + 4, 12, 1); R(c, '#6a4a2a', x + 7, y + 4, 1, 10); break;
    case 'toolrack': R(c, w2, x + 1, y + 2, 14, 9); R(c, '#b8c0cc', x + 3, y + 3, 1, 6); R(c, '#d0533e', x + 6, y + 3, 2, 4); R(c, '#e8c46a', x + 10, y + 4, 3, 1); R(c, '#b8c0cc', x + 11, y + 5, 1, 4); break;
    case 'tank': case 'tank_lab': shadow(c, x, y, 10); R(c, w1, x + 4, y + 1, 8, 2); R(c, p.label === 'tank_lab' ? '#2a3a5a' : w0, x + 3, y + 3, 10, 11);
      if (p.label === 'tank_lab') { R(c, '#c48cff', x + 6, y + 6 + (Math.floor(t / 700) % 3), 4, 4); R(c, '#e8d8ff', x + 7, y + 7 + (Math.floor(t / 700) % 3), 1, 1); }
      else R(c, '#ffb347', x + 3, y + 7, 10, 1);
      break;
    case 'console': case 'monitor': shadow(c, x, y, 12); R(c, w0, x + 2, y + 6, 12, 8); screen(c, x + 3, y + 1, 10, 6, acc, t + p.id * 97, false); R(c, w2, x + 3, y + 9, 10, 1); break;
    case 'valve': R(c, w2, x + 7, y + 6, 2, 8); R(c, '#d0533e', x + 4, y + 4, 8, 2); R(c, '#d0533e', x + 7, y + 2, 2, 6); break;
    case 'gurney': shadow(c, x, y, 14); R(c, '#b8c0cc', x + 1, y + 6, 14, 3); R(c, '#e8ebf0', x + 2, y + 5, 12, 2); R(c, w2, x + 2, y + 9, 1, 5); R(c, w2, x + 13, y + 9, 1, 5); break;
    case 'crystal': R(c, '#c48cff', x + 6, y + 3, 4, 10); R(c, '#e8d8ff', x + 7, y + 3, 1, 6); R(c, '#9a5ae8', x + 3, y + 8, 3, 5); R(c, '#9a5ae8', x + 10, y + 7, 3, 6); break;
    case 'server': shadow(c, x, y, 12); R(c, '#14161c', x + 2, y + 1, 12, 14); for (let k = 0; k < 5; k++) R(c, blink(t, 200 + k * 70, k * 50) ? acc : '#2a2f38', x + 4 + (k % 2) * 6, y + 3 + k * 2, 2, 1); break;
    case 'flag': R(c, w2, x + 4, y + 1, 1, 14); R(c, '#3a6ee8', x + 5, y + 2, 7, 5); R(c, '#e8e2d8', x + 5, y + 4, 7, 1); break;
    case 'antenna': R(c, w1, x + 7, y + 3, 2, 12); R(c, w0, x + 3, y + 3, 10, 1); R(c, blink(t, 600) ? '#ff5252' : '#5a2020', x + 7, y + 1, 2, 2); break;
    default: R(c, w0, x + 4, y + 6, 8, 8); break;
  }
}

/** Dibuja un objeto del escenario en (x, y) en píxeles del mundo. */
export function drawProp(c: Ctx, p: Prop, x: number, y: number, pal: ZonePalette, t: number): void {
  const acc = pal.accent;
  const w0 = pal.wall[0]; const w1 = pal.wall[1]; const w2 = pal.wall[2];
  const off = !!p.off;
  switch (p.kind) {
    case 'terminal': {
      shadow(c, x, y, 12);
      R(c, w0, x + 2, y + 5, 12, 9); R(c, w1, x + 2, y + 5, 12, 1);
      const col = p.label === 'boss' ? '#ff4b4b' : p.hacked ? '#7dff9a' : p.lockout ? '#ff5252' : acc;
      screen(c, x + 3, y + 1, 10, 7, col, t + p.id * 131, off || p.used === true && p.label === 'boss');
      R(c, w2, x + 4, y + 10, 8, 1); R(c, w2, x + 4, y + 12, 8, 1);
      break;
    }
    case 'o2station': {
      shadow(c, x, y, 10);
      R(c, '#d8dde4', x + 3, y + 2, 10, 12); R(c, '#9aa3ad', x + 3, y + 11, 10, 3);
      R(c, p.used ? '#3a3f48' : '#4fa8d8', x + 5, y + 4, 6, 6);
      if (!p.used) R(c, '#bfe8ff', x + 5, y + 4 + (Math.floor(t / 250) % 6), 6, 1);
      R(c, '#2a2f38', x + 7, y + 11, 2, 2);
      break;
    }
    case 'powernode': {
      shadow(c, x, y, 10);
      R(c, '#2a2f38', x + 3, y + 2, 10, 12); R(c, '#4a505c', x + 3, y + 2, 10, 1);
      const on = !p.used;
      R(c, on ? '#f2d45c' : '#5a5030', x + 6, y + 4, 4, 2); R(c, on ? '#f2d45c' : '#5a5030', x + 7, y + 6, 2, 2); R(c, on ? '#f2d45c' : '#5a5030', x + 5, y + 8, 4, 2);
      if (on && blink(t, 150)) R(c, '#fff6c0', x + 7, y + 6, 1, 1);
      break;
    }
    case 'vending': case 'merchant': {
      shadow(c, x, y, 14);
      R(c, p.kind === 'merchant' ? '#5a3a6a' : '#3a5a7a', x + 1, y + 1, 14, 14);
      R(c, '#0b1018', x + 3, y + 3, 7, 9);
      for (let k = 0; k < 3; k++) R(c, ['#e85a5a', '#f2d45c', '#7fc4e0'][k], x + 4 + k * 2, y + 5 + (k % 2) * 3, 1, 2);
      R(c, blink(t, 700, p.id * 50) ? acc : shadeHex(acc, -0.5), x + 11, y + 4, 3, 2);
      R(c, '#1a1f28', x + 11, y + 8, 3, 4);
      if (p.kind === 'merchant') { R(c, '#ffd166', x + 2, y + 1, 12, 1); }
      break;
    }
    case 'workbench': {
      shadow(c, x, y, 14);
      R(c, '#6a4a2a', x + 1, y + 6, 14, 3); R(c, '#8a6a3a', x + 1, y + 6, 14, 1);
      R(c, w2, x + 2, y + 9, 2, 5); R(c, w2, x + 12, y + 9, 2, 5);
      R(c, '#b8c0cc', x + 3, y + 4, 4, 2); R(c, '#e8c46a', x + 9, y + 3, 2, 3);
      if (blink(t, 900)) R(c, '#ffb347', x + 10, y + 3, 1, 1);
      break;
    }
    case 'autosurgeon': {
      shadow(c, x, y, 14);
      R(c, '#d8dde4', x + 1, y + 8, 14, 5); R(c, '#9aa3ad', x + 1, y + 12, 14, 2);
      R(c, '#5a616e', x + 7, y + 1, 2, 6); R(c, '#5a616e', x + 3, y + 3, 10, 1);
      R(c, '#ff7aa8', x + 3, y + 4, 1, 3); R(c, '#7af0ff', x + 12, y + 4, 1, 3 + (Math.floor(t / 400) % 2));
      break;
    }
    case 'bed': {
      shadow(c, x, y, 14);
      R(c, w2, x + 1, y + 4, 14, 10); R(c, '#c9ccd4', x + 2, y + 4, 12, 7); R(c, '#e8ebf0', x + 2, y + 4, 4, 4);
      R(c, p.used ? '#6a6f78' : '#4a8ac8', x + 7, y + 7, 7, 4);
      break;
    }
    case 'cryopod': {
      shadow(c, x, y, 12);
      R(c, '#b8c0cc', x + 2, y + 1, 12, 14); R(c, '#e8ebf0', x + 2, y + 1, 12, 1);
      const lit = p.variant === 1 || !p.used;
      R(c, lit ? '#3a8ac8' : '#1a2a38', x + 4, y + 3, 8, 9);
      if (lit) { R(c, '#9fe8ff', x + 4, y + 3, 8, 1); R(c, 'rgba(200,240,255,0.5)', x + 6, y + 5, 4, 5); }
      R(c, blink(t, 1100, p.id * 37) ? '#7dff9a' : '#2a5a3a', x + 7, y + 13, 2, 1);
      break;
    }
    case 'barrel': {
      shadow(c, x, y, 10);
      R(c, '#b0402a', x + 4, y + 3, 8, 11); R(c, '#d0533e', x + 4, y + 3, 2, 11); R(c, '#80301f', x + 4, y + 6, 8, 1); R(c, '#80301f', x + 4, y + 11, 8, 1);
      R(c, '#f2d45c', x + 7, y + 7, 2, 3);
      break;
    }
    case 'cable': {
      R(c, '#1a1a1a', x + 1, y + 9, 6, 2); R(c, '#1a1a1a', x + 6, y + 7, 7, 2);
      if (!p.off && blink(t, 120, p.id * 13)) { R(c, '#bff6ff', x + 12, y + 5, 2, 2); R(c, '#7af0ff', x + 13, y + 9, 1, 2); R(c, '#ffffff', x + 11, y + 4, 1, 1); }
      break;
    }
    case 'container': {
      shadow(c, x, y, 12);
      const opened = p.used;
      R(c, '#4a5868', x + 2, y + 5, 12, 9); R(c, '#5c6c7e', x + 2, y + 5, 12, 1);
      if (opened) { R(c, '#1a1f28', x + 3, y + 6, 10, 3); R(c, '#4a5868', x + 2, y + 2, 12, 2); }
      else { R(c, '#6a7c90', x + 2, y + 3, 12, 3); R(c, p.hack ? '#ff5252' : '#ffb347', x + 7, y + 7, 2, 2); }
      break;
    }
    case 'exit': case 'entry': case 'hullExit': {
      const col = p.kind === 'exit' ? '#7dff9a' : p.kind === 'hullExit' ? '#ffb46e' : '#7fc4e0';
      R(c, '#1a1f28', x + 1, y + 1, 14, 14); R(c, w1, x + 1, y + 1, 14, 2);
      R(c, '#0a0c10', x + 3, y + 4, 10, 10);
      const k = Math.floor(t / 220) % 4;
      for (let i = 0; i < 3; i++) R(c, i === k % 3 ? col : shadeHex(col, -0.55), x + 5, y + 5 + i * 3, 6, 2);
      if (p.kind === 'exit') { R(c, col, x + 7, y + 13, 2, 1); }
      break;
    }
    case 'airlockPanel': {
      R(c, '#2a2f38', x + 4, y + 2, 8, 10); R(c, '#ffb347', x + 4, y + 2, 8, 1);
      R(c, p.used ? '#ff5252' : (blink(t, 500) ? '#ff5252' : '#7a2020'), x + 6, y + 5, 4, 3);
      R(c, '#ffb347', x + 5, y + 9, 1, 1); R(c, '#ffb347', x + 10, y + 9, 1, 1);
      break;
    }
    case 'vent': {
      R(c, '#0a0b0e', x + 2, y + 4, 12, 9); R(c, w1, x + 2, y + 4, 12, 1);
      for (let k = 0; k < 4; k++) R(c, w2, x + 3, y + 6 + k * 2, 10, 1);
      break;
    }
    case 'log': {
      const v = p.variant ?? 0;
      if (p.used) break;
      const glow = blink(t, 800, p.id * 61) ? '#ffe7a0' : '#c8a050';
      if (v === 1) { R(c, '#e8e2c8', x + 5, y + 6, 6, 7); R(c, '#9a9480', x + 6, y + 8, 4, 1); R(c, '#9a9480', x + 6, y + 10, 3, 1); }
      else if (v === 2) { R(c, '#2a2f38', x + 4, y + 6, 8, 6); R(c, glow, x + 5, y + 7, 6, 3); }
      else if (v === 3) { R(c, '#d0533e', x + 3, y + 5, 10, 1); R(c, '#d0533e', x + 4, y + 8, 7, 1); R(c, '#d0533e', x + 3, y + 11, 9, 1); }
      else { R(c, '#3a4a5a', x + 5, y + 6, 6, 8); R(c, glow, x + 6, y + 7, 4, 4); }
      R(c, 'rgba(255,230,160,0.25)', x + 3, y + 4, 10, 1);
      break;
    }
    case 'npc': {
      if (p.used && !p.scene) break;
      const look = p.npc ? NPC_LOOK[p.npc] : undefined;
      if (look) {
        const s = personSprite(`npc_${p.npc}`, look);
        const f = Math.floor((t + p.id * 300) / 600) % 2;
        R(c, 'rgba(0,0,0,0.35)', x + 4, y + 14, 8, 2);
        c.drawImage(s.frames[f], x, y);
      }
      break;
    }
    case 'event': {
      if (p.used) break;
      const k = (Math.sin(t / 300 + p.id) + 1) / 2;
      R(c, `rgba(255,209,102,${0.25 + 0.35 * k})`, x + 5, y + 5, 6, 6);
      R(c, '#ffd166', x + 7, y + 3, 2, 7); R(c, '#ffd166', x + 7, y + 11, 2, 2);
      break;
    }
    case 'camera': {
      R(c, '#2a2f38', x + 5, y + 1, 6, 4); R(c, '#4a505c', x + 4, y + 4, 8, 3);
      R(c, p.off ? '#333' : blink(t, 600, p.id * 7) ? '#ff3030' : '#601010', x + 10, y + 5, 2, 1);
      break;
    }
    case 'emlight': {
      const col = p.variant === 1 ? '#ff8f4a' : pal.emergency;
      R(c, '#2a2f38', x + 5, y + 1, 6, 3);
      R(c, blink(t, 900, p.id * 77) ? col : shadeHex(col, -0.4), x + 6, y + 2, 4, 2);
      break;
    }
    case 'decor': drawDecor(c, p, x, y, pal, t); break;
    case 'keycard': {
      if (p.used) break;
      const col = lockColor(p.key);
      const bob = Math.round(Math.sin(t / 250 + p.id) * 1);
      R(c, 'rgba(0,0,0,0.3)', x + 5, y + 13, 6, 1);
      R(c, col, x + 4, y + 5 + bob, 8, 6); R(c, shadeHex(col, 0.5), x + 4, y + 5 + bob, 8, 1);
      R(c, '#0a0c10', x + 5, y + 8 + bob, 4, 1); R(c, '#ffffff', x + 10, y + 7 + bob, 1, 2);
      break;
    }
    case 'core': {
      const k = (Math.sin(t / 400) + 1) / 2;
      R(c, '#14101c', x, y, TS, TS);
      R(c, `rgba(196,140,255,${0.4 + 0.5 * k})`, x + 3, y + 3, 10, 10);
      R(c, '#f0e0ff', x + 6, y + 6, 4, 4);
      R(c, '#c48cff', x + 1, y + 7, 2, 2); R(c, '#c48cff', x + 13, y + 7, 2, 2); R(c, '#c48cff', x + 7, y + 1, 2, 2); R(c, '#c48cff', x + 7, y + 13, 2, 2);
      break;
    }
    case 'corpse': {
      R(c, '#3a1414', x + 2, y + 10, 12, 4);
      R(c, '#6a6f78', x + 3, y + 9, 9, 3); R(c, '#d9a988', x + 11, y + 9, 3, 3); R(c, '#5a1a1a', x + 5, y + 12, 6, 2);
      break;
    }
    case 'radio': {
      R(c, '#3a3a2a', x + 3, y + 7, 10, 7); R(c, '#5a5a3a', x + 3, y + 7, 10, 1);
      R(c, '#1a1a10', x + 4, y + 9, 4, 4); R(c, blink(t, 300) ? '#7dff9a' : '#2a5a3a', x + 10, y + 9, 2, 1);
      R(c, '#9a9a8a', x + 11, y + 2, 1, 5);
      break;
    }
  }
}
