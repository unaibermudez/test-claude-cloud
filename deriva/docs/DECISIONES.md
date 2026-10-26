# DERIVA — Registro de decisiones

Cada decisión tomada ante una ambigüedad del encargo, con su motivo. Orden cronológico.

| # | Decisión | Motivo |
|---|----------|--------|
| D01 | Todo el juego vive en `deriva/`; no se toca nada fuera. | Requisito explícito. |
| D02 | Versiones fijadas: TypeScript 5.9, Vite 7, Vitest 3.2, ESLint 9 + typescript-eslint 8, Playwright 1.63 (coincide con el Chromium preinstalado). | Estables y compatibles entre sí; TypeScript 7 (nativo) aún no es compatible con typescript-eslint. |
| D03 | Los textos se escriben por dominios en `src/i18n/es/*.json` y `src/i18n/en/*.json`; el cargador los fusiona en un único diccionario por idioma. `npm run content` genera además `i18n/es.json` y `i18n/en.json` fusionados (artefacto de referencia). | Un único JSON de cientos de KB sería inmanejable para editar y revisar; la fusión mantiene la interfaz pedida. |
| D04 | La UI de menús, diálogos, inventario y HUD es DOM ligero (HTML/CSS sin frameworks) superpuesto al canvas; el mundo, las luces, las partículas, los retratos y el hub se pintan en Canvas 2D. | Texto nítido y escalable (tamaño de letra, alto contraste, lectores de pantalla) sin dibujar fuentes a mano; sigue sin usar frameworks de UI. |
| D05 | La lógica es mutable pero determinista: `step(state, action)` modifica el estado y devuelve eventos (sonido, mensajes, efectos). Todo el azar de lógica sale de `state.rng` (sfc32). Los efectos visuales usan otro RNG con semilla independiente para no alterar la partida. | Rendimiento (sin copiar estados grandes por turno) y reproducibilidad total. |
| D06 | La atmósfera se simula por **secciones** (regiones de suelo separadas por puertas) y el fuego por casilla. | Legible para el jugador ("esta sala está despresurizada") y barato de simular. |
| D07 | Sistema de tiempo por energía: velocidad 100 = un turno; acciones con coste variable. | Permite enemigos rápidos/lentos sin complejidad. |
| D08 | Pronombres: él / ella / elle (es) — he / she / they (en). Los textos usan marcas `{o|a|e}` que se resuelven según la elección. | El español exige concordancia de género; así cada jugador ve frases correctas. |
| D09 | La identidad pasada del protagonista es **Noa Ferrán** (nombre ambiguo en género). El nombre elegido por el jugador es el que el clon "se pone". | Compatibiliza la elección de nombre con el giro narrativo. |
| D10 | El minijuego de hackeo es una "ruta de datos" por turnos (alternar fila/columna en una matriz de códigos para formar secuencias). Siempre resoluble (se genera a partir de una solución). Accesibilidad: modo asistido (resalta la siguiente casilla correcta) y modo saltar (éxito automático con coste de energía). | Justo, sin reflejos, escalable. |
| D11 | Sprites: plantillas de píxel en matrices de texto (16×16, 2 fotogramas de reposo) por arquetipo + paleta y adornos por enemigo; movimiento, ataque, daño y muerte se animan por transformaciones (desplazamiento, aplastamiento, destello, desintegración en partículas). | 48+ enemigos con 5 animaciones dibujadas a mano no es viable con calidad homogénea; así cada enemigo es reconocible y animado. |
| D12 | Retratos de PNJ: matrices 32×32 dibujadas en datos. ÁGORA: patrón generativo (anillos y ojo) cuyo color, simetría y ritmo dependen de la Confianza. | Requisito de retratos + representación abstracta de la IA. |
| D13 | Zona secreta (Casco exterior) también con 3 pisos + jefe, 8 enemigos y 2 mini-jefes. | "Cada zona" incluye la secreta; mantiene coherencia. |
| D14 | Total de pisos de la ruta principal: 5 zonas × 4 (3 generados + jefe) = 20. | Encaja en 60–90 min si cada piso dura ~3–4 min. |
| D15 | La Confianza de ÁGORA es por partida, pero arranca en un valor que depende de decisiones de partidas previas (memoria de la IA) y de mejoras. | ÁGORA "recuerda"; el final depende de la partida actual. |
| D16 | Los arcos de PNJ son persistentes entre partidas (etapa del arco en la meta-progresión); su destino final se fija en la partida que alcanza un final. | "Escenas que avanzan a lo largo de varias partidas". |
| D17 | Guardado: se guarda la partida tras cada turno (con limitación de frecuencia) y al salir; la muerte borra la partida al instante. | Reanudación real sin "save scumming". |
| D18 | Los textos completos (registros, diálogos, epílogos) viven en los JSON de i18n; `GUION.md` contiene estructura, cronología, fichas, listas y resúmenes con referencias a sus claves. | Evita duplicar ~30 000 palabras y que se desincronicen. |
| D19 | El "reloj" global de la órbita se mide en turnos (1 turno = 2 s de ficción). Llegar a cero provoca el final de muerte "Caída a Tártaro". | Reloj narrativo legible ("03:12 h para el reingreso"). |
| D20 | Ruta de bloqueo de pisos: tarjetas de acceso de color (ámbar, cian, violeta) + circuitos (puertas que requieren energía). El validador simula la recogida iterativa de llaves. | Requisito de validador; modelo clásico y comprobable. |
