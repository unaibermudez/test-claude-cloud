# DERIVA

> Año 2187. La Estación Perséfone lleva once años en silencio, cayendo muy despacio hacia Tártaro.
> En la bahía de criogenia se abre la cápsula 114.

**DERIVA** es un roguelike por turnos de ciencia ficción y terror psicológico. Recorres una estación
espacial a la deriva con oxígeno y energía limitados, decides en quién confiar (empezando por ÁGORA,
la IA que te despierta) y, muerte a muerte, reconstruyes qué pasó con el Proyecto LETE… y contigo.

Todo es código: el arte se dibuja con rectángulos, la música y los efectos se sintetizan con Web Audio.
No hay recursos externos.

## Cómo jugar

**Juega en el navegador:** https://unaibermudez.github.io/test-claude-cloud/

```bash
cd deriva
npm install
npm run dev        # servidor de desarrollo en http://localhost:5173
```

Versión de producción (estática, lista para GitHub Pages o cualquier hosting):

```bash
npm run build      # genera dist/ con rutas relativas
npm run preview    # sirve dist/ en http://localhost:4173
```

Basta con publicar el contenido de `dist/` (por ejemplo en la rama `gh-pages`).

### Requisitos
- Node 20 o superior.
- Un navegador moderno (Chrome, Firefox, Safari o Edge recientes).

## Controles

| Acción | Teclado | Ratón / mando |
|---|---|---|
| Moverse (8 direcciones) | Flechas · WASD + QEZC · teclado numérico | Clic en una casilla (viaja por lo explorado) · cruceta/stick |
| Atacar cuerpo a cuerpo | Moverse contra el enemigo | Clic en el enemigo adyacente |
| Empujar | Mayús + dirección | Mayús + clic |
| Esperar | Espacio · `.` · Num 5 | — |
| Interactuar / hablar / puertas | F · Intro | A |
| Disparar | R (Tab cambia de objetivo) | Clic en un enemigo lejano · X |
| Lanzar artefacto | G | RB |
| Recoger | P · `,` | — |
| Sigilo | X | LB |
| Linterna | L | — |
| Inventario · implantes · mapa | I · U · M | Y (inventario) |
| Archivo de registros · ÁGORA | J · K | — |
| Implante activo · descansar | Y · V | — |
| Examinar | O (o clic derecho) | — |
| Atajos de la mochila | 1–0 | — |
| Ayuda · pausa | H · Esc | Start |

Todos los controles se pueden reasignar en **Opciones → Controles**.

## Lo esencial

- **Turnos**: el mundo solo avanza cuando actúas.
- **Oxígeno y energía**: el O₂ baja cada turno (y mucho en vacío); la energía alimenta la linterna,
  las armas de energía, el sellado de puertas y los implantes.
- **Salas con estado**: presurizadas, en vacío, en llamas, irradiadas, con refrigerante, a oscuras.
  Puedes sellar compuertas o **vaciar de aire** una sección desde un terminal hackeado.
- **Sigilo**: los enemigos ven y oyen. Un ataque por sorpresa hace mucho más daño.
- **Ruido mental**: la tecnología LETE y el estrés te hacen ver cosas que no están.
- **Muerte permanente**: cada muerte imprime un clon nuevo en **La Cápsula**, donde gastas las
  Memorias ganadas en la mesa de memoria (54 mejoras en 6 ramas).
- **Seis finales** principales y cinco muertes señaladas.

## Modos

Historia · Difícil · Diario (misma semilla para todo el mundo cada día) · Semilla personalizada ·
Pesadilla (se desbloquea al ver un final).

## Accesibilidad

Tamaño de texto, alto contraste, tres modos de daltonismo, reducir parpadeo / temblor / interferencias,
filtro CRT opcional, subtítulos de sonido, hackeo asistido o saltable, oxígeno generoso, enemigos menos
atentos, órbita más larga, controles reasignables, ratón y mando, aviso de contenido al empezar.
Español e inglés completos.

## Guardado

La partida se guarda automáticamente tras cada acción (en `localStorage`, con versión y migraciones).
*Guardar y salir* permite continuar más tarde; la muerte borra la partida (no hay vuelta atrás).
Desde **Opciones → Datos** puedes exportar e importar todo tu progreso en JSON.

## Desarrollo

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprobación de tipos y compilación a `dist/` |
| `npm run lint` | TypeScript estricto + ESLint |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run content` | Comprobación de contenido: textos, referencias, finales y registros alcanzables; genera `i18n/*.json` y `docs/CONTENIDO.md` |
| `npm run bot -- 60 --campaign 30` | Bot de balance: miles de turnos sin interfaz; escribe `docs/BALANCE_DATOS.md` |
| `npm run e2e` | Pruebas de extremo a extremo con Playwright (capturas en `e2e/shots/`) |
| `npm run check` | Todo lo anterior salvo E2E |

### Estructura

```
deriva/
├─ src/
│  ├─ core/       lógica pura y determinista (sin DOM): estado, generador, combate, IA, atmósfera,
│  │              hackeo, narrativa, meta-progresión, guardado
│  ├─ data/       contenido tipado: zonas, enemigos, objetos, clases, mejoras, logros, escenas, finales
│  ├─ i18n/       textos en español e inglés (JSON) y formateo con pronombres
│  ├─ render/     dibujo procedural: casillas, objetos, sprites, retratos, ÁGORA, mundo, Cápsula, efectos
│  ├─ audio/      efectos sintetizados y música generativa por capas
│  ├─ ui/         interfaz DOM: HUD, paneles, diálogos, pantallas, opciones
│  ├─ input/      teclado reasignable, ratón y mando
│  ├─ app/        máquina de pantallas, bucle, guardado automático, ganchos de pruebas
│  ├─ platform/   almacenamiento y ajustes
│  └─ sim/        bot de simulación
├─ tests/         pruebas unitarias
├─ e2e/           pruebas de Playwright
├─ scripts/       content-check, bot de balance y utilidades
├─ i18n/          textos fusionados (generados)
└─ docs/          diseño, guion, decisiones, progreso, balance, contenido, revisión final
```

Toda la aleatoriedad pasa por un RNG con semilla guardado en el estado: la misma semilla y las mismas
acciones producen exactamente la misma partida (lo comprueban las pruebas).

## Créditos

Diseño, narrativa, programación, arte procedural, audio procedural y control de calidad: un equipo de
desarrollo autónomo. Sin recursos de terceros: fuentes del sistema, sonido sintetizado, gráficos dibujados
por código.

Herramientas: TypeScript, Vite, Vitest, ESLint, Playwright.

Licencia: MIT.
