# DERIVA — Revisión final

Revisión crítica del estado del juego en la versión 1.0, hecha después de jugar sesiones automáticas
(bot en el navegador y Playwright), revisar las capturas y repasar la «Definición de terminado».

## Qué está completo

| Área | Estado |
|---|---|
| Núcleo determinista | RNG con semilla en el estado; misma semilla y acciones ⇒ misma partida (probado, también tras guardar y cargar). Lógica sin DOM, prohibido `Math.random` por lint. |
| Generación | 6 zonas, 3 pisos generados + jefe por zona, validador obligatorio con regeneración. 7.200 pisos validados en las pruebas, ~3,5 ms por piso. |
| Sistemas | O₂ y energía, atmósfera por secciones con descompresión y venteo, fuego, esporas, radiación, refrigerante, oscuridad, puertas y sellado, hackeo justo con modo asistido y saltable, sigilo y ruido, IA por estados, combate táctico (29 armas, 11 artefactos, coberturas, empujones, entorno), 45 implantes con contrapartidas, ruido mental y alucinaciones, chatarra, tiendas, taller, objetos sin identificar y defectuosos, eventos de piso, reloj orbital e inestabilidad de piso. |
| Contenido | 48 enemigos + 5 tipos de élite, 12 minijefes, 7 jefes multifase, 66 registros, 34 eventos morales, 6 PNJ con arcos de 3–6 escenas, 6 finales + 5 muertes señaladas, giro narrativo revelado por capas. |
| Meta | La Cápsula explorable que cambia con el progreso, 54 mejoras en 6 ramas, 6 clases, Archivo, Bestiario, Galería de finales, Estadísticas, 51 logros, 5 modos (incluido diario y semilla). |
| Presentación | Arte 100 % por código con luz, niebla, memoria, brillos de color, partículas, temblor, interferencia, CRT opcional; retratos; patrón de ÁGORA según la Confianza; HUD diegético y todos los paneles; título animado, introducción, epílogos con destinos, créditos. |
| Audio | Efectos sintetizados por acción, música generativa por capas (zona, tensión, O₂ bajo, narrativa), temas de zona, Cápsula, jefes y finales; volúmenes independientes, silencio y subtítulos de sonido. |
| Accesibilidad | Controles reasignables, ratón, mando, tamaño de texto, alto contraste, 3 modos de daltonismo, reducir parpadeo/temblor/interferencia, ayudas de dificultad no condescendientes, aviso de contenido, pantalla completa, español e inglés completos. |
| Guardado | Automático tras cada acción, versionado con migraciones, guardar y salir, muerte permanente sin trampas, exportar/importar JSON. |
| Calidad | 55 pruebas unitarias, `content-check` sin errores (paridad de idiomas, referencias, finales y registros alcanzables, arcos encadenados), 3 pruebas E2E con capturas revisadas y sin errores ni avisos de consola, lint y compilación limpios, 60 FPS medidos en el navegador. |

## Problemas encontrados en la revisión y corregidos

1. **Escala de presión** — la interfaz suponía presión 0–1 y la lógica usa 0–100: el HUD nunca avisaba del vacío. Corregido en HUD, mapa, examinar y render.
2. **Hackeo** — desconectar tras conseguir el acceso contaba como fallo y disparaba la alarma. Ahora conserva el acceso y el botón dice «Terminar».
3. **Esc sobre el consejo inicial** abría la pausa. Ahora lo cierra; los consejos se ocultan solos tras unos turnos.
4. **Interacción ambigua** — con un terminal y una estación de O₂ juntos solo se podía usar el terminal. Ahora `F` ofrece un menú para elegir (D22).
5. **Ortografía de las formas neutras** («Técnice» → «Técnique», «Médique», «amigue»).
6. **Reloj orbital** — mostraba un turno = un segundo; la decisión D19 fija dos segundos.
7. **Finales bloqueados** — no se veían en el Núcleo; ahora aparecen atenuados con su requisito, y la selección con teclado salta las opciones no disponibles.
8. **Mejoras sin efecto** — radar de archivo, mapa de servicio, rastro de clones y voz de ÁGORA ya funcionan.
9. **Balance** — jefes de Z2+ invencibles para el bot, disolución mental casi segura en LETE, muertes por O₂ por un error de interacción. Ver `BALANCE.md`.
10. **Pantalla completa** — faltaba; añadida en Opciones y con F10.

## Versión 1.1 — tiempo real, voces e interfaces

Revisión de los cambios pedidos tras la 1.0 («2D real, sin cuadrícula, voces que lean los textos, mejores interfaces»):

| Área | Estado |
|---|---|
| Tiempo real | Movimiento libre con colisiones y reloj del mundo sobre el mismo núcleo determinista (D25). Ataque y apuntado con ratón, disparo al más cercano, pausa al abrir paneles (D26). Modo por turnos y tres velocidades en Opciones. 60 FPS medidos. |
| Escenario | Sin rejilla visible: texturas y juntas en coordenadas del mundo, muros con borde exterior, sombras, luz suavizada, enemigos interpolados (D27). |
| Voces | Diálogos, ÁGORA, radio, registros, introducción y epílogos con voz sintetizada y perfil por personaje; repetir/escuchar/parar; atenuación de música; configurables por tipo (D28). |
| Interfaces | HUD rediseñado (D29), barra de acceso rápido clicable, aviso de interacción flotante, paneles y diálogos con nuevo estilo. |
| Calidad | 58 pruebas unitarias, 4 E2E (incluida una de tiempo real con ataque por ratón y voces), content-check, lint y compilación limpios. |

Problemas encontrados y corregidos durante esta ronda: un desenfoque de luz a pantalla completa bajaba a
41 FPS (sustituido por uno a baja resolución), etiquetas de armas solapadas en la barra rápida (sustituidas
por iconos) y una radio que abría un diálogo encima del inventario en las pruebas E2E.

Puntos débiles nuevos: la calidad y variedad de las voces dependen de las instaladas en el sistema (en
Linux sin voces el juego queda en silencio con subtítulos); los enemigos siguen moviéndose casilla a casilla
(interpolados) porque la IA y el combate siguen siendo por turnos.

## Versión 1.2 — teclado, claridad y arte

| Área | Estado |
|---|---|
| Teclado | Todo el juego se puede jugar y configurar sin ratón: creación del personaje, idioma, Cápsula (lista de puestos), paneles con pestañas, hackeo (Tab a los botones), tienda, taller, opciones (D30). Probado con una E2E solo de teclado. |
| Claridad | Ayudas de teclas en cada panel con las teclas reales (D31), objetivo con dirección en el HUD y franja de teclas (D32), Esc ya no se pierde en los consejos. |
| Arte | Iconos 16×16 multimaterial y pintor con luz común (D33). Los objetos en el suelo se leen mejor y los del inventario se distinguen de un vistazo. |

Problemas encontrados y corregidos en esta ronda: el campo de nombre no recibía el foco porque el panel aún
no estaba en el documento; al entrar en una fila de opciones se elegía la primera en vez de la activa; una
prueba E2E dependía de que Esc cerrara el consejo inicial.

## Puntos débiles que quedan (honestamente)

- **Balance sin personas.** El bot llega con regularidad a la zona 3 y gana a todos los jefes con la
  progresión, pero no cierra campañas completas. Las cifras de duración son estimaciones. Las ayudas de
  accesibilidad cubren el margen de error, pero haría falta una ronda de pruebas con jugadores.
- **Arte procedural sencillo.** Los sprites de criaturas siguen siendo siluetas de 16×16 con dos fotogramas (ahora con luz y contorno de color); las animaciones de
  ataque, daño y muerte son transformaciones (desplazamiento, destello, desvanecido), no fotogramas dibujados.
  Es coherente y legible, pero no es pixel art artesanal.
- **Audio no verificable de forma automática.** Se comprueba que no produce errores, pero la mezcla y el
  carácter de la música solo se pueden juzgar escuchando.
- **Mando** implementado con la API estándar y probado solo por código, no con hardware real.
- **Sin controles táctiles**: en móvil se puede jugar con toques en modo por turnos (clic para moverse y
  atacar), pero no hay stick ni botones en pantalla para el tiempo real, el inventario y el resto de acciones.
- **Inglés** completo y revisado, pero no por un hablante nativo.
- La escena `hull_entry` quedó sin uso (la transición al casco la hace la escotilla); se mantiene por si se
  quiere añadir una conversación con Faro antes de salir.
- El paquete JS pesa ~700 KB (230 KB comprimido), casi todo texto; aceptable para un juego estático.

## Veredicto

El juego cumple la definición de terminado en sistemas, contenido, presentación, accesibilidad, guardado y
verificación automática. El riesgo principal es la dificultad real con jugadores humanos, que solo se ha
podido aproximar con un bot; está documentado y hay ayudas configurables para mitigarlo.
