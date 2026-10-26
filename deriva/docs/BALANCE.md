# DERIVA — Balance

Cómo se ha ajustado la dificultad, con qué herramientas y qué dicen los números. Los datos crudos de la
última simulación están en [`BALANCE_DATOS.md`](BALANCE_DATOS.md) (se regeneran con `npm run bot`).

## Herramientas

| Herramienta | Qué mide |
|---|---|
| `npm run bot -- 20 --campaign 30` | Partidas completas sin interfaz con tres estrategias (agresiva, sigilosa, prudente), sin mejoras y con el árbol completo, y una campaña de 30 partidas que compra mejoras con las Memorias ganadas. |
| `npx tsx scripts/bossfight.ts 10 [estrategia] [full]` | Cada jefe por separado, empezando en su zona con el equipo de compensación de esa zona. |
| `npx tsx scripts/quick.ts 20 prudente [full]` | Muestra rápida: dónde y de qué muere el bot. |
| `npx tsx scripts/o2dbg.ts` | Diagnóstico de muertes por oxígeno (turnos en vacío, estaciones vistas sin usar…). |

El bot es una **cota inferior**: no planifica, no usa la mitad de los sistemas (ventear salas, empujar al
vacío, sellar puertas a propósito, dialogar para ganar Confianza) y combate de frente. Se usa para detectar
picos de dificultad y comparar cambios de forma reproducible (misma semilla ⇒ misma partida), no como
jugador objetivo (decisión D21).

## Duración

- Un piso dura de media **~200 turnos** del bot (`Turnos/piso`).
- Estimamos **0,75 s por turno** para un humano que juega con fluidez (más en combates y diálogos,
  menos al cruzar salas exploradas con clic). Una partida completa de 20 pisos ≈ 4.000–5.000 turnos
  ⇒ **50–65 minutos**, que con lectura de registros y diálogos sube a **60–90 minutos**.
- El reloj orbital (12.000 turnos) deja margen de sobra para una partida normal: solo apremia a quien
  se demora mucho en cada piso; la inestabilidad del piso (250/450/650 turnos) empuja a avanzar.

## Curva de progresión observada (bot)

| Situación | Pisos medios | Zona habitual de muerte | Lectura |
|---|---:|---|---|
| Primeras partidas, sin mejoras | 6,2–6,8 | Jardines (Z2), algunas en Z3 | Las primeras vidas enseñan los sistemas en 15–20 min. |
| Árbol completo | 8,1–8,6 | Z2–Z3, alguna en Z4 | Las mejoras se notan (+2 pisos de media) sin convertir el juego en trivial. |
| Campaña de 30 partidas | — | máxima Z3 | El bot no cierra la campaña; ver limitaciones. |

### Jefes por separado (10 intentos cada uno, estrategia prudente)

| Jefe | Sin mejoras | Árbol completo |
|---|---:|---:|
| Hipnos (Z1) | 10/10 | 10/10 |
| Deméter (Z2) | 5/10 | 7/10 |
| Flegetonte (Z3) | 0/10 | 4/10 |
| Cocito (Z4) | 0/10 | 6/10 |
| Estigia / Coro pleno (Z5) | 0/10 | 10/10 |
| Aqueronte (Z6, secreta) | 2/10 | 4/10 |

Con la progresión todos los jefes son vencibles incluso para el bot; Flegetonte sigue siendo el pico
(es el muro de mitad de campaña, a propósito: obliga a usar la refrigeración de la sala).

## Cambios de balance aplicados (resumen)

| Cambio | Motivo (dato del bot) |
|---|---|
| Daño enemigo global ×0,8; regeneración natural fuera de combate cada 8 turnos | Desgaste acumulado en Z1–Z2. |
| Jefes: vida ×0,72 y daño ×0,7; minijefes ×0,85/×0,85; ataques avisados ×0,9 (D23) | 0/8 victorias contra jefes de Z2 en adelante. |
| Menos esbirros invocados y menos blindaje en jefes de Z3–Z6 | El bot hacía 1–2 de daño por golpe a Flegetonte. |
| Oleadas de fuego en damero y propagación ×0,5 en arenas | La arena de Flegetonte se convertía en un mar de llamas. |
| Ruido mental por ataque mental 7 → 3,5; grito 6 → 4; en LETE el primer derrumbe deja el ruido en 40 | 6/8 muertes por *disolución* en Cocito incluso con el árbol completo. |
| Presupuesto de enemigos Z2–Z5 −2 | Z2 concentraba el 70 % de las muertes. |
| Radiación y esporas algo más lentas | Muertes por desgaste ambiental en exploraciones largas. |
| Arreglos del bot: esquiva casillas avisadas, no ataca jefes con escudo, usa todas las estaciones de O₂ adyacentes | Sin esto las cifras medían errores del bot, no del juego. Este último error también afectaba a jugadores humanos (D22). |

## Limitaciones conocidas

- El bot no gana campañas completas: llega a Z3 de forma regular y a Z4–Z5 de forma ocasional. Un jugador
  humano usa sistemas que el bot ignora (venteo, sigilo deliberado, Confianza de ÁGORA, puertas selladas,
  identificar objetos, gestionar el inventario), así que esperamos que un jugador medio gane tras varias
  partidas de progresión, pero **no se ha validado con personas**.
- Las cifras de minutos son estimaciones a partir de turnos.
- Las ayudas de accesibilidad (oxígeno generoso, órbita larga, enemigos menos atentos, hackeo asistido)
  existen precisamente para cubrir el margen de error de este balance.
