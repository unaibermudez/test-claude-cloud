# DERIVA

> Año 2187. La Estación Perséfone lleva once años en silencio, cayendo muy despacio hacia Tártaro.
> En la bahía de criogenia se abre la cápsula 114.

**DERIVA** es un roguelike 2D en tiempo real (con modo por turnos opcional) de ciencia ficción y terror psicológico. Recorres una estación
espacial a la deriva con oxígeno y energía limitados, decides en quién confiar (empezando por ÁGORA,
la IA que te despierta) y, muerte a muerte, reconstruyes qué pasó con el Proyecto LETE… y contigo.

Todo es código: el arte se dibuja con mapas de píxeles y un pintor con luz (tonos por material,
contorno de color, destellos y luz de contorno), la música y los efectos se sintetizan con Web Audio
y los personajes hablan con la síntesis de voz del navegador. No hay recursos externos.

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

Por defecto el juego va en **tiempo real**: te mueves libremente (sin casillas) mientras el mundo
avanza con un reloj propio. Abrir cualquier panel o diálogo pausa el mundo. En **Opciones → Partida**
puedes cambiar al modo **por turnos** (el mundo solo avanza cuando actúas) y elegir la velocidad del reloj.

| Acción | Teclado | Ratón / mando |
|---|---|---|
| Moverse (libre, 8 direcciones combinables) | Mantener flechas · WASD + QEZC · teclado numérico | Stick analógico · cruceta |
| Apuntar | — | Mover el ratón (punto de mira) |
| Atacar | Chocar contra el enemigo | Clic izquierdo hacia el enemigo (cuerpo a cuerpo si está al lado, disparo si está lejos) |
| Empujar | Mayús + dirección | Mayús + clic |
| Esperar / reiniciar el reloj | Espacio · `.` · Num 5 | — |
| Interactuar / hablar / puertas | F · Intro (si hay varias cosas cerca, se abre un menú) | Clic en el objeto adyacente · A |
| Disparar al enemigo más cercano | R (en modo turnos: Tab cambia de objetivo) | X |
| Lanzar artefacto | G | RB |
| Recoger · soltar | P · `,` · Supr / T | — |
| Sigilo | X | LB |
| Linterna | L | — |
| Inventario · implantes · mapa | I · U · M | Y (inventario) |
| Archivo de registros · ÁGORA | J · K | — |
| Implante activo · descansar | Y · V | — |
| Examinar | O (o clic derecho) | — |
| Atajos de la mochila | 1–0 (o clic en la barra inferior) | — |
| Pantalla completa | F10 | — |
| Ayuda · pausa | H · Esc | Start |

**Menús y paneles, todo con teclado:** flechas para elegir, Intro para aceptar, Esc para volver, Q/E o
Tab para cambiar de pestaña, 1–9 para elegir directamente en los menús numerados, Inicio/Fin y
RePág/AvPág para saltar. Cada panel muestra abajo sus teclas (con las que tengas asignadas). En
**La Cápsula**, Tab o M abren la lista de puestos para ir a cualquiera sin caminar. Los campos de texto
(nombre, semilla) reciben el foco al seleccionarlos.

Todos los controles se pueden reasignar en **Opciones → Controles**.

## Lo esencial

- **Tiempo real sobre un núcleo por turnos**: el reloj del mundo marca un turno cada 230–400 ms
  (según la velocidad elegida); atacar o abrir puertas consume tiempo. En modo por turnos, el mundo
  solo avanza cuando actúas.
- **Objetivo siempre a la vista**: la tarjeta de navegación dice qué hacer ahora (buscar la tarjeta
  ámbar, llegar al ascensor, derrotar al jefe, recargar O₂…) con flecha y distancia cuando ya sabes dónde
  está. Abajo a la derecha, una franja recuerda las teclas principales (se puede ocultar).
- **Voces**: ÁGORA, los PNJ, la radio, los registros, la introducción y los epílogos se leen en voz alta
  con la síntesis de voz del navegador (cada personaje con su timbre). Se configura en **Opciones → Audio**.
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

Modo por turnos, velocidad del reloj, voces activables por tipo de texto, tamaño de texto, alto contraste, tres modos de daltonismo, reducir parpadeo / temblor / interferencias,
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
