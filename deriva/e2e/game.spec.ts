/**
 * Pruebas de extremo a extremo: arranque, partida nueva, movimiento, combate, inventario,
 * guardado y carga, y un final alcanzado por guion. Guarda capturas en `e2e/shots/` para revisarlas.
 */
import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

type Api = {
  screen(): string;
  summary(): { zone: number; floor: number; turn: number; hp: number; x: number; y: number; o2: number; inv: number; modal: string | null; over: boolean } | null;
  act(a: unknown): number;
  toCore(): boolean;
  godMode(): void;
  panels(): string[];
  bot(n: number): number;
  app: {
    run: { actors: { id: number; hp: number; dead?: boolean; faction: string; x: number; y: number }[]; pid: number; player: { inv: { id: string }[] } } | null;
    meta: { introSeen: boolean; stats: { runs: number }; endings: string[] };
  };
};

const SHOTS = 'e2e/shots';
let problems: string[] = [];

function watch(page: Page): void {
  problems = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
}

async function api<T>(page: Page, fn: (d: Api) => T): Promise<T> {
  return page.evaluate((src) => {
    const d = (window as unknown as { __deriva: Api }).__deriva;
    return (new Function('d', `return (${src})(d);`))(d) as T;
  }, fn.toString());
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function freshStart(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('deriva.settings.v1', JSON.stringify({ lang: 'es' }));
      sessionStorage.setItem('e2e-init', '1');
    }
  });
  await page.goto('/?e2e=1');
}

async function newRun(page: Page): Promise<void> {
  // aviso de contenido → título → intro → creación → Cápsula → ascensor → partida
  await expect(page.locator('.warning h2')).toBeVisible();
  await shot(page, '01-aviso');
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-logo')).toBeVisible();
  await shot(page, '02-titulo');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await shot(page, '03-intro');
  await page.keyboard.press('Space');
  await expect(page.locator('input[type=text]')).toBeVisible();
  await page.locator('input[type=text]').fill('Vera');
  await page.getByRole('button', { name: 'ella (femenino)' }).click();
  await shot(page, '04-creacion');
  await page.locator('.warning .actions button').click();
  await expect(page.locator('.hubhud')).toBeVisible();
  await shot(page, '05-capsula');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('KeyF');
  await expect(page.getByRole('button', { name: 'Bajar a la estación' })).toBeVisible();
  await shot(page, '06-nueva-partida');
  await page.getByRole('button', { name: 'Bajar a la estación' }).click();
  await expect(page.locator('.vitals')).toBeVisible();
  await page.keyboard.press('Escape'); // cerrar consejo inicial
}

test.beforeAll(async () => {
  const fs = await import('node:fs');
  fs.mkdirSync(SHOTS, { recursive: true });
});

test('arranque, partida nueva, movimiento, inventario, combate y guardado', async ({ page }) => {
  watch(page);
  await freshStart(page);
  await newRun(page);
  await shot(page, '07-partida');
  expect(await api(page, (d) => d.screen())).toBe('run');
  await expect(page.locator('.vitals .name')).toContainText('Vera');

  // movimiento: alguna dirección libre cambia la posición y avanza el turno
  const s0 = (await api(page, (d) => d.summary()))!;
  for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(k);
  const s1 = (await api(page, (d) => d.summary()))!;
  expect(s1.turn).toBeGreaterThan(s0.turn);
  expect(s1.x !== s0.x || s1.y !== s0.y).toBe(true);
  await shot(page, '08-movimiento');

  // inventario
  await page.keyboard.press('KeyI');
  await expect(page.locator('.panel h2', { hasText: 'Inventario' })).toBeVisible();
  await shot(page, '09-inventario');
  const inv0 = (await api(page, (d) => d.summary()))!.inv;
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const inv1 = (await api(page, (d) => d.summary()))!.inv;
  expect(inv1).toBeLessThanOrEqual(inv0);

  // combate: un enemigo junto al jugador, atacar moviéndose contra él
  await page.evaluate(() => {
    const d = (window as unknown as { __deriva: { app: { run: unknown } } }).__deriva;
    const st = d.app.run as { actors: { id: number; x: number; y: number; faction: string; hp: number }[]; pid: number; map: { w: number; tiles: number[] } };
    const p = st.actors.find((a) => a.id === st.pid)!;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const t = st.map.tiles[(p.y + dy) * st.map.w + p.x + dx];
      if (t === 2 && !st.actors.some((a) => a.x === p.x + dx && a.y === p.y + dy)) {
        const g = window as unknown as { __spawnDir: number[] };
        g.__spawnDir = [dx, dy];
        break;
      }
    }
  });
  const dir = await page.evaluate(() => (window as unknown as { __spawnDir: number[] }).__spawnDir);
  expect(dir).toBeTruthy();
  await page.evaluate(([dx, dy]) => {
    const w = window as unknown as { __deriva: { app: { run: { actors: { id: number; x: number; y: number }[]; pid: number } } }; __spawn: (dx: number, dy: number) => void };
    void w;
    const d = (window as unknown as { __deriva: { app: { run: Record<string, unknown> } } }).__deriva;
    const st = d.app.run as unknown as { actors: { id: number; def: string; x: number; y: number; hp: number; maxHp: number; faction: string; ai: { mode: string }; status: Record<string, number>; facing: number; ap: number }[]; pid: number; nextId: number };
    const p = st.actors.find((a) => a.id === st.pid)!;
    st.actors.push({ id: st.nextId++, def: 'eco_errante', x: p.x + dx, y: p.y + dy, hp: 30, maxHp: 30, ap: 0, faction: 'enemy', ai: { mode: 'idle', tx: 0, ty: 0, timer: 0, cd: {}, homeX: 0, homeY: 0 } as unknown as { mode: string }, status: {}, facing: 4 });
  }, dir);
  const key = dir[0] === 1 ? 'ArrowRight' : dir[0] === -1 ? 'ArrowLeft' : dir[1] === 1 ? 'ArrowDown' : 'ArrowUp';
  const enemyHp = async (): Promise<number> => page.evaluate(() => {
    const st = (window as unknown as { __deriva: { app: { run: { actors: { def: string; hp: number; dead?: boolean }[] } } } }).__deriva.app.run;
    const e = st.actors.find((a) => a.def === 'eco_errante' && !a.dead);
    return e ? e.hp : 0;
  });
  const hp0 = await enemyHp();
  for (let i = 0; i < 6; i++) await page.keyboard.press(key);
  await shot(page, '10-combate');
  expect(await enemyHp()).toBeLessThan(hp0);

  // ayuda y mapa
  await page.keyboard.press('KeyH');
  await expect(page.locator('.panel h2', { hasText: 'Ayuda' })).toBeVisible();
  await shot(page, '11-ayuda');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM');
  await shot(page, '12-mapa');
  await page.keyboard.press('Escape');

  // el bot juega un rato para comprobar estabilidad visual
  await api(page, (d) => { d.godMode(); return d.bot(150); });
  await shot(page, '13-tras-bot');

  // guardar y recargar: la partida continúa en el mismo turno
  const before = (await api(page, (d) => d.summary()))!;
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel h2', { hasText: 'Pausa' })).toBeVisible();
  await shot(page, '14-pausa');
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page.locator('.title-logo')).toBeVisible();
  await page.reload();
  await expect(page.locator('.title-logo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar partida' })).toBeVisible();
  await shot(page, '15-titulo-con-partida');
  await page.getByRole('button', { name: 'Continuar partida' }).click();
  const after = (await api(page, (d) => d.summary()))!;
  expect(after.turn).toBe(before.turn);
  expect([after.x, after.y]).toEqual([before.x, before.y]);
  await shot(page, '16-partida-cargada');

  expect(problems, problems.join('\n')).toEqual([]);
});

test('un final completo por guion: Núcleo, epílogo y créditos', async ({ page }) => {
  watch(page);
  await freshStart(page);
  await newRun(page);
  expect(await api(page, (d) => d.toCore())).toBe(true);
  await shot(page, '20-nucleo');
  await page.keyboard.press('KeyF');
  await expect(page.locator('.dialog')).toBeVisible();
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); // completar el texto
  await shot(page, '21-dialogo-nucleo');
  // elegir «olvido» (siempre disponible) y confirmar
  const opts = page.locator('.dialog .opt');
  const n = await opts.count();
  let picked = false;
  for (let i = 0; i < n; i++) {
    const txt = (await opts.nth(i).textContent()) ?? '';
    if (/olvid|borr|olvida/i.test(txt)) { await opts.nth(i).click(); picked = true; break; }
  }
  if (!picked) await opts.last().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await shot(page, '22-confirmacion');
  await page.locator('.dialog .opt').first().click();
  await expect(page.locator('.epilogue')).toBeVisible({ timeout: 5000 });
  await shot(page, '23-epilogo');
  const endings = await api(page, (d) => d.app.meta.endings);
  expect(endings.length).toBe(1);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.credits')).toBeVisible();
  await shot(page, '24-creditos');
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.locator('.hubhud')).toBeVisible();
  await shot(page, '25-capsula-tras-final');
  expect(problems, problems.join('\n')).toEqual([]);
});

test('muerte, resumen y vuelta a La Cápsula con Memorias', async ({ page }) => {
  watch(page);
  await freshStart(page);
  await newRun(page);
  await page.evaluate(() => {
    const st = (window as unknown as { __deriva: { app: { run: { player: { o2: number } } } } }).__deriva.app.run;
    st.player.o2 = 0;
  });
  for (let i = 0; i < 60; i++) {
    if ((await api(page, (d) => d.screen())) !== 'run') break;
    await page.keyboard.press('Space');
  }
  await expect(page.locator('h2', { hasText: 'Tu clon ha muerto' })).toBeVisible({ timeout: 8000 });
  await shot(page, '30-muerte');
  await page.getByRole('button', { name: 'Volver a La Cápsula' }).click();
  await expect(page.locator('.hubhud .mem')).not.toHaveText('Memorias: 0');
  await shot(page, '31-capsula-tras-muerte');
  // árbol de mejoras desde la Cápsula
  await page.evaluate(() => { (window as unknown as { __deriva: { app: { open: (s: string) => void } } }).__deriva.app.open('tree'); });
  await expect(page.locator('.tree')).toBeVisible();
  await shot(page, '32-arbol');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { (window as unknown as { __deriva: { app: { open: (s: string) => void } } }).__deriva.app.open('options'); });
  await shot(page, '33-opciones');
  await page.keyboard.press('Tab');
  await shot(page, '34-accesibilidad');
  expect(problems, problems.join('\n')).toEqual([]);
});
