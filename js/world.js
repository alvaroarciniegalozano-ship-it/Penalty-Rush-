// ============================================================================
//  Escenario: coloca el GLB del estadio en el sistema lógico del juego,
//  calcula la escala a partir de la portería real, iluminación y ambiente.
// ============================================================================
import * as THREE from 'three';
import { STADIUM_SRC as SRC, REF } from './config.js';
import { byOrigName, toLowPoly } from './assets.js';

export function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld(scene, assets) {
  const gltf = assets.stadium;
  const stadium = gltf.scene;
  stadium.updateMatrixWorld(true);

  // ---- 1. Medición real de la portería dentro del GLB (ejes originales) ----
  const goalNode = byOrigName(stadium, 'Plane');
  const gb = new THREE.Box3().setFromObject(goalNode, true);
  const measured = {
    boxMinX: gb.min.x, boxMaxX: gb.max.x, boxMinY: gb.min.y, boxMaxY: gb.max.y,
    boxMinZ: gb.min.z, boxMaxZ: gb.max.z,
  };
  const tol = 0.05;
  const checks = [
    [measured.boxMaxX, SRC.goalLineX], [measured.boxMinX, SRC.netBackX],
    [measured.boxMinZ, SRC.outerZMin], [measured.boxMaxZ, SRC.outerZMax],
    [measured.boxMaxY, SRC.crossbarTopY],
  ];
  const mismatch = checks.some(([a, b]) => Math.abs(a - b) > tol);
  if (mismatch) console.warn('[PenaltyRush] La portería medida difiere de las constantes previstas:', measured, SRC);

  // Valores a usar: la medición real manda (con el grosor de postes de SRC).
  const outerZMin = measured.boxMinZ, outerZMax = measured.boxMaxZ;
  const postT = ((SRC.innerZMin - SRC.outerZMin) + (SRC.outerZMax - SRC.innerZMax)) / 2;
  const innerW = (outerZMax - outerZMin) - 2 * postT;
  const crossbarT = SRC.crossbarTopY - SRC.crossbarBottomY;
  const groundY = SRC.groundY;
  const innerH = (measured.boxMaxY - crossbarT) - groundY;

  // ---- 2. Escala uniforme (sin deformar): compromiso ancho/alto reglamentarios ----
  const S = 0.5 * (REF.GOAL_W / innerW + REF.GOAL_H / innerH);

  const goal = {
    W: innerW * S,
    H: innerH * S,
    postR: (postT / 2) * S,
    barR: (crossbarT / 2) * S,
    depth: (measured.boxMaxX - measured.boxMinX) * S,
    netTop: (SRC.netTopY - groundY) * S,
    scale: S,
  };

  // ---- 3. Transformación: GLB (abre hacia +X) -> sistema lógico (línea de gol Z=0) ----
  // x' = -z_glb ; z' = x_glb  (giro de -90° sobre Y). El jugador queda en +Z.
  const root = new THREE.Group();
  root.rotation.y = -Math.PI / 2;
  root.scale.setScalar(S);
  const cz = (outerZMin + outerZMax) / 2;
  const c = new THREE.Vector3(measured.boxMaxX, groundY, cz).multiplyScalar(S);
  c.applyEuler(root.rotation);
  root.position.copy(c).multiplyScalar(-1);
  root.add(stadium);
  scene.add(root);

  // ---- 4. Estilo low poly uniforme ----
  toLowPoly(stadium, { flat: true });
  // Telón de cielo del GLB: sin iluminación, mismo color que el fondo
  const sky = byOrigName(stadium, 'Plane.003');
  let skyColor = new THREE.Color(0x0099e6);
  if (sky && sky.material) {
    const m = Array.isArray(sky.material) ? sky.material[0] : sky.material;
    skyColor = m.color.clone();
    sky.material = new THREE.MeshBasicMaterial({ color: skyColor, side: THREE.DoubleSide });
  }
  scene.background = skyColor.clone();

  // Posición del telón en coordenadas lógicas (para cerrar el suelo hasta él)
  let skyZ = -28;
  if (sky) {
    const p = new THREE.Vector3();
    sky.updateWorldMatrix(true, false);
    sky.getWorldPosition(p);
    skyZ = p.z;
  }

  // Suelo adicional (mismo verde que el césped del GLB) para que el campo no "flote"
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 260, 1, 1),
    new THREE.MeshLambertMaterial({ color: new THREE.Color('#2e8a00') })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.04, skyZ + 130 + 0.5);
  scene.add(ground);

  // Punto de penal (el GLB no lo dibuja): disco blanco de bajo polígono
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  spotMat.polygonOffset = true; spotMat.polygonOffsetFactor = -2; spotMat.polygonOffsetUnits = -2;
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8), spotMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.01, REF.PENALTY_DIST);
  scene.add(spot);

  // Nubes low poly decorativas (iguales para todos los niveles)
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, flatShading: true });
  const cg = new THREE.IcosahedronGeometry(1, 0);
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group();
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(cg, cloudMat);
      m.scale.set(2 + rnd() * 2.2, 1.1 + rnd() * 0.8, 1.4 + rnd());
      m.position.set(k * 2.4 - n, rnd() * 0.6, rnd());
      cl.add(m);
    }
    cl.position.set(-34 + i * 8.5 + rnd() * 3, 5 + rnd() * 5, skyZ + 3);
    clouds.add(cl);
  }
  scene.add(clouds);

  // ---- 5. Iluminación: día soleado, sol de frente (desde la portería), sin sombras duras ----
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x7cab4a, 1.55);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.7);
  sun.position.set(2, 24, -18);          // detrás de la portería, alto
  sun.target.position.set(0, 0, 10);     // apunta hacia el jugador
  scene.add(sun);
  scene.add(sun.target);
  // Sol visible (low poly) sobre la portería
  const sunMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.6, 1),
    new THREE.MeshBasicMaterial({ color: 0xfff1a8, flatShading: true })
  );
  sunMesh.position.set(-11, 9.5, skyZ + 6);
  scene.add(sunMesh);

  const report = { S, goal, measured, tolerancePass: !mismatch, skyZ };
  return {
    S, goal, report, root, spot: { x: 0, y: 0.11, z: REF.PENALTY_DIST }, clouds,
    update(t) { clouds.position.x = Math.sin(t * 0.03) * 3; },
  };
}
