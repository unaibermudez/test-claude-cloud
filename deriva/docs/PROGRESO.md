# DERIVA — Diario de progreso

Este documento se lee al empezar cada sesión y se actualiza al cerrar cada fase.

## Estado de fases

| Fase | Estado |
|------|--------|
| 1. Preproducción | ✅ Documentos base (DISENO, GUION, DECISIONES), proyecto configurado |
| 2. Núcleo | ✅ RNG con semilla, FOV, caminos, generador + validador, turnos por energía, guardado versionado |
| 3. Sistemas | ✅ O₂/energía, atmósfera por secciones, fuego, esporas, puertas/sellado/venteo, hackeo, sigilo/ruido, IA, combate, implantes, ruido mental, alucinaciones, economía, taller, eventos de piso, reloj orbital |
| 4. Contenido | ✅ 6 zonas, 48 enemigos + élites, 12 minijefes, 7 jefes multifase, 29 armas, 45 implantes, 66 registros, 34 eventos morales, 6 arcos de PNJ, 6 finales + 5 muertes señaladas |
| 5. Meta-progresión | ✅ La Cápsula, Memorias, árbol de 54 nodos, 6 clases, Archivo, Bestiario, Galería de finales, Estadísticas, 51 logros, 5 modos |
| 6. Presentación | ✅ Render procedural con luz y niebla, partículas, efectos de pantalla, retratos, patrón de ÁGORA, HUD diegético, todos los paneles, audio y música generativos, entrada remapeable con ratón y mando |
| 7. QA y balance | ✅ 55 pruebas unitarias, content-check, 3 E2E con capturas revisadas, informe de balance (`BALANCE.md`) |
| 8. Cierre | ✅ README, `REVISION_FINAL.md`, versión 1.0.0, rama `main` unificada y publicación en GitHub Pages |
| 9. Versión 1.1 | ✅ Tiempo real con movimiento libre, escenario sin cuadrícula, voces sintetizadas, HUD e interfaces rediseñados |

## Diario

### Sesión 1
- Configurado `deriva/` (TypeScript estricto, Vite, Vitest, ESLint, Playwright 1.63).
- Redactados `DISENO.md`, `GUION.md` (cronología, personajes, 6 arcos, 34 eventos morales, 66 registros, finales) y `DECISIONES.md`.

### Sesión 2
- Núcleo determinista completo (`src/core`): generador con validador (7.200 pisos validados en las pruebas, ~3,5 ms de media), combate, IA con estados, jefes con patrones avisados, atmósfera, hackeo, narrativa con condiciones y efectos.
- Datos de contenido en `src/data` y todos los textos en `src/i18n/{es,en}`.
- Meta-progresión y guardado con migraciones; bot de simulación con tres estrategias.

### Sesión 3
- Capa de presentación: renderizador del mundo (`src/render`), interfaz DOM (`src/ui`), entrada (`src/input`), aplicación (`src/app`).
- La Cápsula como sala explorable que cambia con el progreso; fondo animado del título.
- Pruebas: 55 unitarias, `content-check` (0 errores, 66/66 registros encontrables), 3 E2E con capturas revisadas.
- Errores encontrados y corregidos gracias a las pruebas: escala de presión en la interfaz, desconexión tras hackeo con éxito, Esc sobre el consejo inicial, ortografía de formas neutras (técnique, médique, amigue).
- Implementadas las mejoras que aún no tenían efecto (radar de archivo, mapa de servicio, rastro de clones, voz de ÁGORA).

### Sesión 4
- Ronda de balance guiada por el bot y por `scripts/bossfight.ts`; arreglos del bot que también destaparon un error de interacción para jugadores (menú de elección).
- Pantalla completa, reloj orbital a dos segundos por turno, finales bloqueados visibles en el Núcleo.
- Revisión final (`REVISION_FINAL.md`), versión 1.0.0.

### Sesión 5
- Tiempo real 2D (`src/app/realtime.ts`): posición continua con colisiones, reloj del mundo, apuntado y ataque con el ratón, disparo al más cercano, pausa automática con paneles; el modo por turnos sigue disponible. La Cápsula también se recorre con movimiento libre.
- Render sin cuadrícula: suelos y muros con texturas en coordenadas del mundo, sombras de pared, luz suavizada e interpolación de enemigos (60 FPS medidos en Chromium).
- Voces (`src/audio/voice.ts`): diálogos, ÁGORA, radio, registros, introducción y epílogos leídos en voz alta con perfiles por personaje; botones de repetir/escuchar; sección de voces en Opciones.
- HUD y estilos rediseñados (tarjetas, barras segmentadas, minimapa vivo, barra de acceso rápido, aviso flotante de interacción); paneles y diálogos con animaciones y retrato más grande.
- Pruebas: 58 unitarias (3 nuevas de pasos libres), 4 E2E (nueva: tiempo real, ataque con ratón y voces sin errores), content-check sin errores. Versión 1.1.0.

## Problemas conocidos
- Ver «Puntos débiles que quedan» en `REVISION_FINAL.md` (balance sin pruebas con personas, arte procedural sencillo, mando sin probar en hardware, sin controles táctiles; la calidad de las voces depende de las que tenga instaladas el sistema).
