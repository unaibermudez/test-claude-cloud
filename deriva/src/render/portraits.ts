/**
 * Retratos de diálogo (32×32 escalados) generados por código y el patrón abstracto de ÁGORA,
 * que cambia de forma y color según la Confianza.
 */
import { Grid, shadeHex, mixHex, makeCanvas, ctx2d, paint } from './pixel';
import { NPC_LOOK, type PersonSpec } from './sprites';
import { CLASSES } from '../data/classes';

interface Face extends PersonSpec { bg: string; mouth?: 'flat' | 'smile' | 'sad' | 'open'; age?: number; scar?: boolean; eyesColor?: string }

const FACES: Record<string, Face> = {
  celia: { ...NPC_LOOK.celia, bg: '#1b2430', mouth: 'flat', age: 2 },
  tomas: { ...NPC_LOOK.tomas, bg: '#2a2014', mouth: 'smile', age: 3 },
  bruno: { ...NPC_LOOK.bruno, bg: '#2a2410', mouth: 'open', age: 0 },
  solis: { ...NPC_LOOK.solis, bg: '#141a2a', mouth: 'flat', scar: true, age: 1 },
  lenz: { ...NPC_LOOK.lenz, bg: '#1e1428', mouth: 'sad', age: 1 },
  faro: { ...NPC_LOOK.faro, bg: '#2a1a0c', mouth: 'flat', age: 3 },
  ferran: { suit: ['#06060a', '#e8e2d8', '#9a948a', '#ffffff'], hair: '#6a6a6a', accessory: 'glasses', bg: '#16161c', mouth: 'flat', age: 3, skin: '#d8b090' },
  lucia: { suit: ['#06060a', '#7a9ac8', '#4a5a80', '#c8d8ff'], hair: '#2a1a10', bg: '#141c28', mouth: 'smile', age: 1, skin: '#e0b898' },
  tuerca: { suit: ['#06060a', '#e8c46a', '#9a7a30', '#fff0b0'], accessory: 'robot', bg: '#201c10', mouth: 'flat' },
};

const cache = new Map<string, HTMLCanvasElement>();

function personFace(key: string, f: Face): HTMLCanvasElement {
  const g = new Grid(32, 32);
  const skin = 7; const hair = 8; const B = 1; const E = 4; const A = 5;
  // hombros y cuello
  g.ellipse(16, 31, 12, 6, B);
  g.rect(13, 21, 6, 5, skin);
  // cabeza
  g.ellipse(16, 14, 7.5, 9, skin);
  // pelo
  if (f.hair) {
    g.ellipse(16, 8, 8, 4.5, hair);
    g.rect(8, 8, 2, 7, hair); g.rect(22, 8, 2, 6, hair);
    if ((f.age ?? 0) === 0) g.rect(9, 6, 14, 3, hair);
  }
  // ojos
  const eyeY = 14;
  g.rect(12, eyeY, 2, 2, E); g.rect(18, eyeY, 2, 2, E);
  g.set(12, eyeY, 6); g.set(18, eyeY, 6);
  if ((f.age ?? 0) >= 2) { g.line(11, eyeY + 3, 13, eyeY + 3, 9); g.line(18, eyeY + 3, 20, eyeY + 3, 9); }
  // nariz y boca
  g.set(16, 17, 9); g.set(16, 18, 9);
  switch (f.mouth) {
    case 'smile': g.line(13, 20, 19, 20, 9); g.set(12, 19, 9); g.set(20, 19, 9); break;
    case 'sad': g.line(13, 20, 19, 20, 9); g.set(12, 21, 9); g.set(20, 21, 9); break;
    case 'open': g.rect(14, 20, 4, 2, 9); break;
    default: g.line(13, 20, 19, 20, 9); break;
  }
  if (f.scar) g.line(19, 10, 21, 16, A);
  switch (f.accessory) {
    case 'glasses': g.rect(10, 13, 5, 4, A); g.rect(17, 13, 5, 4, A); g.rect(11, 14, 3, 2, E); g.rect(18, 14, 3, 2, E); g.rect(15, 14, 2, 1, A); break;
    case 'beard': g.ellipse(16, 21, 6, 3.5, hair); g.line(13, 20, 19, 20, 2); break;
    case 'cap': g.rect(8, 5, 16, 3, A); g.rect(20, 7, 6, 2, A); break;
    case 'robot': g.rect(4, 22, 8, 8, A); g.rect(6, 24, 2, 2, E); g.rect(9, 24, 2, 2, E); break;
    case 'antenna': g.line(22, 6, 26, 1, A); break;
    case 'hood': g.ellipse(16, 10, 10, 9, 2); g.ellipse(16, 14, 7.5, 9, skin); g.rect(12, eyeY, 2, 2, E); g.rect(18, eyeY, 2, 2, E); break;
    case 'mask': g.rect(9, 11, 14, 8, A); g.rect(11, 13, 10, 2, E); break;
    case 'cross': g.rect(15, 25, 2, 5, A); g.rect(13, 27, 6, 1, A); break;
    case 'halo': g.ellipse(16, 3, 8, 1.5, A); break;
    default: break;
  }
  if (f.visor && f.accessory !== 'glasses') g.rect(10, 13, 12, 3, E);
  const [o, b, s, h] = f.suit;
  const colors = ['', b, s, h, f.visor ?? '#e8f4ff', shadeHex(b, 0.3), o, f.skin ?? '#d9a988', f.hair ?? '#3a2a20', shadeHex(f.skin ?? '#d9a988', -0.4)];
  const cv = makeCanvas(32, 32);
  const c = ctx2d(cv);
  // fondo con contraluz detrás de la cabeza
  const grd = c.createRadialGradient(16, 12, 2, 16, 14, 22);
  grd.addColorStop(0, mixHex(f.bg, '#9fb8d8', 0.22));
  grd.addColorStop(1, shadeHex(f.bg, -0.35));
  c.fillStyle = grd;
  c.fillRect(0, 0, 32, 32);
  for (let y = 0; y < 32; y += 2) { c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(0, y, 32, 1); }
  c.drawImage(paint(g, { color: (v) => colors[v] || null, emissive: (v) => v === E && !!f.visor, rim: '#8fd8ff', gradient: 0.2 }), 0, 0);
  void key;
  return cv;
}

function silhouette(bg: string, fg: string, glyph: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = makeCanvas(32, 32);
  const c = ctx2d(cv);
  c.fillStyle = bg;
  c.fillRect(0, 0, 32, 32);
  c.fillStyle = fg;
  glyph(c);
  return cv;
}

/** Retrato estático por hablante. ÁGORA se dibuja aparte (animado). */
export function portrait(speaker: string, playerClass = 'tecnico'): HTMLCanvasElement {
  const key = speaker === 'player' ? `player_${playerClass}` : speaker;
  const hit = cache.get(key);
  if (hit) return hit;
  let cv: HTMLCanvasElement;
  if (FACES[speaker]) cv = personFace(speaker, FACES[speaker]);
  else if (speaker === 'player') {
    const cls = CLASSES.find((k) => k.id === playerClass) ?? CLASSES[0];
    cv = personFace('player', { suit: cls.suit, bg: '#10161e', mouth: 'flat', visor: '#9fe8ff', accessory: 'mask', skin: '#c8a888' });
  } else if (speaker === 'coro') {
    cv = silhouette('#140a1c', '#c48cff', (c) => {
      for (let i = 0; i < 6; i++) { c.globalAlpha = 0.25 + i * 0.1; c.beginPath(); c.arc(16 + Math.sin(i) * 6, 16 + Math.cos(i * 1.7) * 5, 7 - i * 0.6, 0, Math.PI * 2); c.fill(); }
      c.globalAlpha = 1; c.fillStyle = '#ffffff'; c.fillRect(12, 14, 2, 2); c.fillRect(18, 15, 2, 2); c.fillRect(15, 19, 2, 1);
    });
  } else if (speaker === 'radio') {
    cv = silhouette('#0c140c', '#7dff9a', (c) => {
      c.fillRect(6, 12, 20, 12); c.fillStyle = '#0c140c'; c.fillRect(8, 14, 9, 8);
      c.fillStyle = '#7dff9a'; for (let i = 0; i < 4; i++) c.fillRect(9, 15 + i * 2, 7, 1);
      c.fillRect(20, 15, 3, 2); c.fillRect(22, 4, 1, 8);
    });
  } else if (speaker === 'narrator') {
    cv = silhouette('#0a0a0e', '#9aa3ad', (c) => { c.fillRect(8, 15, 16, 2); c.fillRect(15, 8, 2, 16); });
  } else {
    cv = silhouette('#0e0e12', '#5a5f68', (c) => {
      c.beginPath(); c.arc(16, 13, 7, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(16, 30, 11, 7, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0e0e12'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText('?', 16, 17);
    });
  }
  cache.set(key, cv);
  return cv;
}

/**
 * Patrón de ÁGORA. Confianza baja: geometría roja, angulosa y nerviosa.
 * Media: anillos ámbar. Alta: flor cian/dorada lenta y orgánica.
 */
export function drawAgora(c: CanvasRenderingContext2D, size: number, trust: number, t: number, calm = false): void {
  const s = size;
  const k = Math.max(0, Math.min(1, trust / 100));
  c.save();
  c.fillStyle = '#05060a';
  c.fillRect(0, 0, s, s);
  const cx = s / 2; const cy = s / 2;
  const hue = k < 0.35 ? 0 + k * 40 : k < 0.65 ? 35 + (k - 0.35) * 40 : 170 + (k - 0.65) * 60;
  const speed = calm ? 0.3 : 1;
  const sides = k < 0.35 ? 3 : k < 0.65 ? 6 : 12;
  const rings = 5;
  c.translate(cx, cy);
  for (let r = rings; r >= 1; r--) {
    const rad = (s * 0.42 * r) / rings;
    const rot = t * 0.0004 * speed * (r % 2 ? 1 : -1) * (k < 0.35 ? 2.2 : 1);
    const jitter = k < 0.35 && !calm ? Math.sin(t * 0.02 + r) * 1.5 : 0;
    c.strokeStyle = `hsla(${hue + r * 6}, ${70 + k * 20}%, ${45 + r * 6}%, ${0.25 + 0.12 * r})`;
    c.lineWidth = Math.max(1, s / 64);
    c.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const wob = k >= 0.65 ? Math.sin(a * 3 + t * 0.002 * speed) * rad * 0.12 : 0;
      const x = Math.cos(a) * (rad + wob + jitter);
      const y = Math.sin(a) * (rad + wob + jitter);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  // núcleo (el "ojo")
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.003 * speed);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.18);
  g.addColorStop(0, `hsla(${hue}, 90%, ${70 + pulse * 15}%, 1)`);
  g.addColorStop(1, `hsla(${hue}, 90%, 40%, 0)`);
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, s * 0.18, 0, Math.PI * 2); c.fill();
  if (k < 0.35) {
    c.fillStyle = `hsla(${hue}, 90%, 60%, 0.9)`;
    c.fillRect(-s * 0.12, -1, s * 0.24, 2);
  }
  c.restore();
}
