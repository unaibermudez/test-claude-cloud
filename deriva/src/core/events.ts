/** Eventos que la lógica emite para render, audio y UI. Los textos son claves de i18n. */
export type Tone = 'info' | 'warn' | 'danger' | 'good' | 'agora' | 'radio' | 'lore' | 'combat' | 'system' | 'hallu';

export type GameEvent =
  | { t: 'msg'; key: string; p?: Record<string, string | number>; tone?: Tone }
  | { t: 'sfx'; id: string; x?: number; y?: number; vol?: number }
  | { t: 'fx'; id: string; x: number; y: number; tx?: number; ty?: number; color?: string; n?: number }
  | { t: 'shake'; power: number }
  | { t: 'anim'; actor: number; anim: 'attack' | 'hurt' | 'death' | 'move'; dx?: number; dy?: number }
  | { t: 'dmg'; x: number; y: number; amount: number; kind?: 'hp' | 'heal' | 'o2' | 'energy' | 'miss' | 'crit' | 'phantom' | 'scrap' }
  | { t: 'floor'; zone: number; floor: number }
  | { t: 'over' }
  | { t: 'log'; id: string }
  | { t: 'music'; mood: string }
  | { t: 'subtitle'; key: string }
  | { t: 'tutorial'; key: string }
  | { t: 'achievement'; id: string }
  | { t: 'bestiary'; id: string }
  | { t: 'bossbar'; actor: number | null };

export class EventSink {
  list: GameEvent[] = [];
  push(e: GameEvent): void {
    this.list.push(e);
  }
  msg(key: string, p?: Record<string, string | number>, tone: Tone = 'info'): void {
    this.list.push({ t: 'msg', key, p, tone });
  }
  sfx(id: string, x?: number, y?: number, vol?: number): void {
    this.list.push({ t: 'sfx', id, x, y, vol });
  }
  fx(id: string, x: number, y: number, extra: { tx?: number; ty?: number; color?: string; n?: number } = {}): void {
    this.list.push({ t: 'fx', id, x, y, ...extra });
  }
}
