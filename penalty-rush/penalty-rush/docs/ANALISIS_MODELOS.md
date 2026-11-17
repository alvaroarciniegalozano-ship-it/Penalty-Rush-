# Análisis técnico de los GLB (previo al desarrollo)

Obtenido leyendo la estructura glTF (`tools/inspect-glb.mjs`) y los vértices de cada modelo. Todos exportados con Blender glTF I/O 5.0.21, sin extensiones.

| Modelo | Tamaño original (X × Y × Z) | Mallas | Triángulos | Esqueleto | Animaciones |
|---|---|---|---|---|---|
| PIA REALIDAD VIRTUAL → `stadium.glb` | 80.6 × 49.8 × 116.6 (con telón de cielo) | 24 | 64 698 | No | No |
| PORTERO → `keeper.glb` | 1.88 × 4.36 × 0.77 | 13 piezas rígidas | 3 760 | No | No |
| BALÓN → `ball.glb` | 1.314 × 1.315 × 1.320 | 1 (2 materiales) | 28 800 | No | No |
| Brazos y piernas → `limbs.glb` | 2.17 × 3.06 × 0.68 | 10 piezas rígidas | 2 112 | No | No |

## Hallazgos que condicionan el diseño
* **Ningún modelo trae huesos ni animaciones.** Portero y protagonista se animan articulando sus piezas alrededor de pivotes calculados desde la geometría (hombro, cadera, rodilla, tobillo), sin deformar mallas.
* **Escenario**: la portería es el nodo `Plane` (24 k triángulos: marco + red) y **abre hacia +X** del GLB. Línea de gol en x = −5.355; red trasera en x = −8.373. Hueco interior 9.093 (z) × 3.210 (y), no 7.32 × 2.44 (proporción distinta), por lo que se aplica una **escala uniforme S ≈ 0.7825** (media de 7.32/9.093 y 2.44/3.210) sin deformar: portería resultante ≈ 7.12 × 2.51 m. Los valores se miden en tiempo de ejecución (Box3) y se comparan con las constantes de `config.js`.
* La textura del césped (`Material.001`) mapea la línea de gol exactamente en x = −5.355 y el centro del área en z = −3.67 (= centro de la portería), lo que confirma el origen lógico. El GLB no dibuja punto de penal: se añade un disco blanco de 8 lados.
* El GLB incluye un telón vertical azul (`Plane.003`) como cielo y 4 árboles low poly detrás de la portería. Se usa el mismo azul como fondo y se añade un suelo verde hasta el telón.
* **Portero y extremidades miran hacia −Z** (las puntas de las botas apuntan a −Z). El portero se gira 180° en Y para mirar al tirador (+Z); las extremidades del jugador ya miran hacia delante.
* **Balón**: centrado en el origen, diámetro 1.314 → escala 0.1674 para 0.22 m. **Portero**: pies en y = −0.043 y coronilla en 4.318 → escala 0.4242 para 1.85 m; el protagonista usa la misma escala.
* Los nombres de nodo se leen de `userData.name` porque GLTFLoader elimina los puntos (`Plane.001` → `Plane001`).

## Sistema lógico del juego
X lateral (derecha +), Y altura (suelo = 0), Z profundidad (línea de gol = 0; el jugador en +Z; la red hacia −Z). El escenario se coloca con un giro de −90° en Y, la escala S y una traslación que lleva el centro de la línea de gol al origen; la geometría original no se modifica.
Balón en (0, 0.11, 11); cámara a 1.65 m de altura, 2.0 m detrás del balón, inclinada 15° hacia el suelo.

## Piezas articuladas
* **Portero**: núcleo (camiseta+cabeza+pantalón, pivote en la cintura), 2 brazos (hombro) y 2 piernas (cadera).
* **Protagonista**: 2 brazos (hombro), 2 piernas (rodilla) y 2 pies (tobillo, anidados en la pierna).
