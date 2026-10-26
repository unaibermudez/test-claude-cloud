# DERIVA — Biblia de diseño

> Tablas completas de contenido (armas, implantes, enemigos, nodos de mejora, logros…) se generan desde los datos en `docs/CONTENIDO.md` con `npm run content`. Este documento fija reglas y números de referencia. Los valores finales de balance están en `src/data/balance.ts` y su justificación en `docs/BALANCE.md`.

## 1. Pilares

1. **Respirar es una decisión.** O₂ y Energía son el reloj inmediato; la órbita, el reloj de fondo.
2. **La estación es el arma.** Compuertas, vacío, fuego, terminales: el entorno mata más que las armas.
3. **Saber es sobrevivir.** Los enemigos se estudian, los objetos se identifican, las alucinaciones se aprenden a leer.
4. **Cada muerte cuenta la historia.** El clon siguiente recuerda un poco más.

## 2. Bucle de partida

Hub (La Cápsula) → elegir clase y modo → 5 zonas × (3 pisos + jefe) → Núcleo → final. La muerte devuelve al hub con Memorias.

## 3. Turnos y tiempo

- Sistema de energía de acción: cada entidad acumula `velocidad` por tick; actúa al llegar a 100. Jugador: velocidad 100; moverse en modo sigilo cuesta 150.
- 1 turno = 2 s de ficción. Reloj orbital: 12 000 turnos (≈ 6 h 40 min) al empezar. Cada mejora de "Cálculo orbital" añade 600.
- **Decaimiento del piso** (turnos en el piso): 0–249 estable · 250 temblores leves (sacudida, polvo) · 450 temblores fuertes (daño al casco: brechas aleatorias, cables rotos) · 650 crítico (brecha cada 40 turnos, refuerzos de Ecos cada 35 turnos). Avisos de ÁGORA en cada umbral.

## 4. Recursos del jugador

| Recurso | Base | Notas |
|---------|------|-------|
| Vida | 30 | Clase ±. Sin regeneración natural. |
| O₂ | 100 | −0,22/turno presurizado · −0,5 baja presión (30–69) · −2,5 vacío (<30) · +0,2 por esfuerzo (atacar, empujar, cargar). A 0: −2 vida/turno. |
| Energía | 60 | Linterna −0,12/turno · sellar compuerta −10 · abrir puerta con circuito −6 · escudo −1/turno · armas energéticas según arma · saltar hackeo −15. |
| Ruido mental | 0 | +0,04/turno en Laboratorios · implantes LETE · ataques psíquicos. Umbrales: 30 distorsión leve · 55 enemigos fantasma · 75 textos alterados y glitch fuerte · 100 colapso (aturdido 3 turnos, −5 vida, vuelve a 70). En Laboratorios, 100 = final de muerte "Disolución". |
| Chatarra | 0 | Moneda de la partida. |

## 5. Atmósfera por secciones

Sección = región de suelo separada por puertas. Estado: presión (0–100), radiación (0–3), refrigerante (sí/no), oscuridad (sí/no). Fuego por casilla.
- Brecha abierta/ventilación: presión −25/turno. Puerta abierta entre secciones: se iguala un 30 % de la diferencia por turno. Soporte vital: +3/turno si no hay brecha.
- **Despresurización**: con presión cayendo bajo 60, objetos sueltos y entidades ligeras (peso ≤1) se desplazan una casilla hacia la brecha por turno; peso 2 con probabilidad 35 %; peso 3 nunca. Quien entra en la brecha es expulsado (muerte instantánea para enemigos; para el jugador, final de muerte "A la deriva" salvo botas magnéticas o anclaje).
- Fuego: se propaga a casillas adyacentes (25 %) si presión ≥40; se apaga con presión <40 o tras 6–10 turnos. Daño 3/turno. Inflama barriles.
- Radiación: daño 1 cada (4 − nivel) turnos; algunos implantes y el traje lo reducen.
- Refrigerante: suelo resbaladizo (25 % de deslizar una casilla extra), conduce electricidad (cables dañan toda la sección inundada).
- Oscuridad: sin luz ambiental; solo linterna, fuego, luces de emergencia y terminales.

## 6. Compuertas y terminales

- Puertas: abierta / cerrada / bloqueada (tarjeta ámbar, cian o violeta) / circuito (requiere 6 de energía) / sellada / rota.
- **Sellar** (−10 Energía, desde un panel adyacente o un terminal): la puerta queda sellada; no se iguala presión, los enemigos (salvo los que derriban puertas) no pasan. Se dessella con −4 Energía.
- **Ventilar** (en terminal o panel de esclusa): abre la esclusa de una sección (brecha controlada) durante 8 turnos.
- Terminales (hackeo): abrir/cerrar puertas, ventilar secciones, desactivar torretas y cámaras, redirigir drones, activar ventilación (dispersa esporas/gas), revelar mapa.

## 7. Hackeo ("ruta de datos")

- Matriz N×N de códigos (N = 4–6). Se empieza en la fila 0; se alterna columna/fila. Búfer de B selecciones.
- Objetivos: secuencia principal (efecto del terminal) + 0–2 secundarias (energía, mapa, chatarra).
- Dificultad: N, longitud de la secuencia (2–4) y búfer (4–8) según zona y tipo de terminal.
- Fallar: alarma (ruido 10 en el terminal) y bloqueo del terminal 20 turnos.
- Accesibilidad: **asistido** (resalta la siguiente casilla de una solución válida) y **saltar** (éxito con −15 Energía).
- La generación parte de una ruta válida: siempre resoluble (verificado por tests con un solucionador).

## 8. Sigilo y percepción

- Ruido (radio en casillas, propagación por caminos; puertas cerradas cuestan ×3): moverse 2 (sigilo 1), cuerpo a cuerpo 4, pistola 9, silenciada 3, clavos 5, energía 6, explosión 14, puerta 3, forzar 8.
- Visión enemiga: alcance 5–9; ve al jugador si hay línea de visión y (casilla iluminada o distancia ≤2 o linterna encendida). Visión nocturna: ignora la luz.
- Estados: reposo/patrulla → alerta (investiga el punto de ruido) → caza (persigue la última posición conocida) → huida (vida <25 % en los cobardes) → vuelve a patrulla tras 12 turnos sin contacto.
- **Ataque furtivo** a un enemigo que no está en caza: impacto seguro, ×2,5 cuerpo a cuerpo y ×1,5 a distancia.

## 9. Combate

- Probabilidad de impacto = precisión del arma − evasión del objetivo − 25 si el objetivo tiene cobertura respecto al atacante − 3 por casilla más allá del alcance óptimo; límites 5–95 %.
- Daño = tirada del arma − blindaje (mín. 1). Crítico 8 % (×1,5).
- Empujar (moverse contra un enemigo con la tecla de empuje): lo desplaza 1 casilla si su peso ≤2; contra pared aturde 1 turno; a una brecha, al fuego o a un cable aplica el entorno.
- Rasgos de arma: retroceso, perforante, ígneo, aturdidor, PEM, sangrado, silencioso, ruidoso, alcance 2, cadena, cono, área, arpón (atrae), mental (daño a Ecos e +Ruido propio), atasco (si está averiada).

## 10. Implantes (5 ranuras)

Cerebro, Ojos, Torso, Brazos, Piernas. Cada implante tiene ventaja y coste. Los implantes LETE suben el Ruido mental. Instalar requiere un **autocirujano** (sala de laboratorio) o un **kit de implante**. Los averiados no se pueden retirar fuera del laboratorio.

## 11. Objetos y economía

- Inventario de 14 casillas + arma cuerpo a cuerpo + arma a distancia equipadas. Munición y gadgets apilan.
- Objetos desconocidos (inyectores de color, módulos sin etiqueta): apariencia aleatoria por partida; se identifican al usarlos, en laboratorio o pidiéndoselo a ÁGORA (Confianza ≥40, una vez por piso).
- Tiendas: máquinas expendedoras (consumibles) y mercaderes-robot (armas, implantes). Precios en `balance.ts`.
- Taller: recetas simples con **piezas** (granadas, selladores, dron, reparar averías).

## 12. Eventos de piso

Probabilidad 35 % por piso (desde el 1-2): avería de gravedad (inercia), apagón general, fuego en cubierta, brecha de casco, tormenta de radiación, subida del Ruido mental. Uno como máximo; los jefes no tienen eventos.

## 13. Generación procedural

- Mapa 60×38 (zona 6: 64×40 con vacío). 8–13 salas + pasillos (MST + 20 % de bucles). Puertas en cada entrada de sala.
- Salas especiales por piso (2–4): tienda, evento, descanso, laboratorio, taller; sala secreta (pared agrietada) 40 %; atajo (conducto de mantenimiento) 50 %.
- Bloqueo: 1–2 puertas de tarjeta en la ruta a la salida; la tarjeta se coloca en una sala alcanzable antes.
- **Validador**: (1) salida alcanzable desde el inicio con recogida iterativa de llaves; (2) cada llave alcanzable antes de su puerta; (3) ningún tramo de vacío obligatorio de más de 12 casillas sin O₂ disponible; (4) las puertas de circuito obligatorias tienen fuente de energía alcanzable antes o el jugador empieza con energía suficiente; (5) número mínimo de salas. Si falla, se regenera con la siguiente subsemilla (tests: 5 000 semillas por zona).

## 14. Meta-progresión

- **Memorias** al morir o terminar: 4 × pisos superados + 10 × mini-jefe + 20 × jefe + 2 × registro nuevo + 1 cada 15 bajas + 40 por final.
- Árbol de 54 nodos en 6 ramas: Supervivencia, Técnica, Sigilo, Memoria (narrativa), Acceso (atajos de zona), Laboratorio (implantes y clases).
- Clases (6): Técnico/a de soporte vital, Infiltrado/a, Médico/a de campo, Soldador/a pesado/a, Hacker, Eco disidente (tras Liberación).
- Modos: Historia, Difícil, Diario (semilla del día), Semilla personalizada, Pesadilla (tras cualquier final).
- Opciones de dificultad: O₂ generoso (×0,6), hackeo asistido/saltar, enemigos menos perceptivos (−2 visión), reloj orbital ampliado (+50 %).

## 15. Controles por defecto

| Acción | Teclado | Mando |
|--------|---------|-------|
| Mover / atacar | Flechas, WASD, numérico (8 dir.), QEZC diagonales | Cruceta / stick |
| Esperar | Espacio, 5 | — |
| Interactuar | F | A |
| Disparar / apuntar | R (Tab cambia objetivo, R/Intro dispara) | X |
| Empujar | Mayús + dirección | LB + dirección |
| Sigilo | X | RB |
| Linterna | L | Y |
| Inventario | I | Select |
| Implantes | U | — |
| Mapa | M | — |
| Archivo | J | — |
| Lanzar gadget | G | — |
| Recoger | , / P | A |
| Ayuda | H / ? | — |
| Pausa | Esc | Start |
Ratón: clic en casilla = ir; clic en enemigo adyacente = atacar; clic derecho = examinar.
