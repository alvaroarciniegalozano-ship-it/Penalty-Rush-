# PENALTY RUSH – The Ultimate Shootout

Videojuego 3D de penales en primera persona (PC, ratón + teclado) con **Three.js**, estilo **low poly**, que integra tus cuatro modelos GLB.

## Cómo ejecutarlo
Los navegadores bloquean los GLB si abres `index.html` con doble clic (`file://`). Usa un servidor local desde esta carpeta:

```bash
cd penalty-rush
python3 -m http.server 8000        # o: npx serve .
# abre http://localhost:8000 en Chrome / Edge / Firefox
```

* Three.js r160 se carga desde el CDN jsDelivr (necesita Internet). **Modo sin conexión (opcional):** `bash tools/vendor-three.sh` copia Three.js a `libs/three` y `index.html` lo detecta solo.
* Para publicarlo: sube la carpeta tal cual a cualquier hosting estático (GitHub Pages, Netlify…). Todas las rutas son relativas.

## Controles
| Acción | Control |
|---|---|
| Apuntar | Mover el ratón (la retícula marca el punto de impacto previsto en la portería) |
| Cargar potencia | Clic izquierdo mantenido |
| Disparar | Soltar el clic |
| Pausa | ESC |
| Reiniciar intento (no cuenta) | R |
| Sonido on/off | M |
| Confirmar / siguiente | ENTER |
| Depuración (informe de modelos, FPS) | F2 |

Más potencia = balón más rápido pero menos preciso (a partir del ~72 %). Los postes y el larguero son físicos; un balón que rebota fuera no es gol.

## Niveles
1. **Entrenamiento** – sin portero, 10 intentos.
2. **Intermedio** – portero lento, torpe y que a veces se equivoca de lado (5 penales).
3. **Profesional** – portero de reacción rápida, con lectura parcial del tirador y estiradas a ambos lados (5 penales). No sabe de antemano dónde vas a disparar: solo ve la trayectoria real tras un tiempo de reacción (con ruido) y, a veces, intuye el lado del tirador en el instante del golpeo.

Calibración (simulación de miles de penales, `tests/keeper.sim.mjs`): nivel 2 ataja ≈18 % de tiros aleatorios y casi ninguno a las esquinas; nivel 3 ataja ≈70 % de tiros aleatorios pero concede ≈56 % de goles a tiros colocados a las esquinas con potencia alta.

## Estructura
```
index.html  css/style.css
js/  main.js (arranque/entrada) · game.js (estados, cámara, apuntado, disparo, niveles)
     world.js (escenario, escala, luces) · player.js (brazos/piernas POV) · keeper.js (vista del portero)
     keeperCore.js (IA + poses + colisiones del portero, puro) · physics.js (balón, postes, red, puro)
     ball.js · audio.js (Web Audio sintetizado) · ui.js · assets.js · config.js
assets/models/ stadium.glb · keeper.glb · ball.glb · limbs.glb   (tus archivos, renombrados sin espacios/acentos)
tools/ inspect-glb.mjs · vendor-three.sh      tests/ …      docs/ANALISIS_MODELOS.md
```
Parámetros ajustables en `js/config.js` (cámara, posición de brazos/piernas, potencia, IA del portero).

## Pruebas incluidas
`node tests/physics.test.mjs` (física) · `node tests/keeper.sim.mjs` (dificultad) · `node --import ./tests/register.mjs tests/integration.mjs` (flujo completo del juego con Three.js simulado).

## Limitaciones conocidas
* **Los modelos no tienen esqueleto ni animaciones**: todas las animaciones son procedurales por piezas rígidas (el portero no flexiona rodillas/codos; el protagonista solo tiene pantorrilla/pie y antebrazo).
* La portería del GLB no tiene las proporciones reglamentarias exactas: escala uniforme de compromiso (≈7.12 × 2.51 m en lugar de 7.32 × 2.44).
* El GLB del escenario no dibuja punto de penal; se añade uno.
* Ver el apartado de verificación en la entrega: el render 3D no pudo probarse con Three.js real en el entorno de desarrollo.
