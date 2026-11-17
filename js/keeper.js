// ============================================================================
//  Vista del portero (PORTERO.glb). El GLB no tiene esqueleto ni animaciones,
//  así que se articula por piezas: cuerpo, 2 brazos (hombro) y 2 piernas
//  (cadera). Todas las poses salen de keeperCore.js (pose -> transformaciones).
// ============================================================================
import * as THREE from 'three';
import { REF, KEEPER_SRC as K, KEEPER_Z } from './config.js';
import { toLowPoly, makePivotGroup } from './assets.js';
import { KeeperController } from './keeperCore.js';

export class KeeperRig {
  constructor(gltf, shadowTex) {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    this.k = REF.KEEPER_H / (box.max.y - box.min.y); // 1.85 m de altura, escala uniforme
    toLowPoly(model, { flat: true });

    const pv = (names, pivot) => {
      const { wrapper } = makePivotGroup(model, names, pivot);
      wrapper.position.fromArray(pivot);
      return wrapper;
    };
    this.parts = {
      core: pv(K.parts.core, [K.centerX, K.waistY, 0]),
      armA: pv(K.parts.armA, K.shoulderA),   // lado +X del GLB  -> lado -X del mundo
      armB: pv(K.parts.armB, K.shoulderB),   // lado -X del GLB  -> lado +X del mundo
      legA: pv(K.parts.legA, K.hipA),
      legB: pv(K.parts.legB, K.hipB),
    };
    const content = new THREE.Group();
    for (const p of Object.values(this.parts)) content.add(p);
    // el pivote de cintura queda en el origen de root
    content.position.set(-K.centerX, -K.waistY, 0);

    this.scaleGroup = new THREE.Group();
    this.scaleGroup.scale.setScalar(this.k);
    this.scaleGroup.add(content);
    // El GLB mira hacia -Z; el portero debe mirar al jugador (+Z): giro de 180° en Y
    this.facing = new THREE.Group();
    this.facing.rotation.y = Math.PI;
    this.facing.add(this.scaleGroup);
    this.lean = new THREE.Group();
    this.lean.add(this.facing);
    this.root = new THREE.Group();
    this.root.add(this.lean);

    this.waistRest = (K.waistY - K.minY) * this.k; // altura de la cintura con los pies en el suelo
    this.root.position.set(0, this.waistRest, KEEPER_Z);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, 0.012, KEEPER_Z);
    this.shadow.renderOrder = 1;
    this.shadow.scale.set(1.1, 0.8, 1);
  }

  addTo(scene) { scene.add(this.root); scene.add(this.shadow); }
  setVisible(v) { this.root.visible = v; this.shadow.visible = v; }

  /** Aplica una pose de KeeperController. */
  apply(pose) {
    const p = this.parts;
    this.root.position.set(pose.hx, pose.hy, KEEPER_Z);
    this.root.rotation.z = -pose.phi;
    this.lean.rotation.z = pose.lean;
    // brazos: A está en el lado +X del GLB (lado -X del mundo tras el giro)
    p.armA.rotation.set(pose.armFwd, 0, pose.gL);
    p.armB.rotation.set(pose.armFwd, 0, -pose.gR);
    // piernas: apertura + balanceo al desplazarse
    const sw = Math.sin(pose.step) * 0.38;
    p.legA.rotation.set(sw, 0, pose.spread);
    p.legB.rotation.set(-sw, 0, -pose.spread);
    // sombra: sigue la proyección del cuerpo en el suelo
    const h = Math.max(0, pose.hy - this.waistRest);
    this.shadow.position.x = pose.hx;
    const s = 1 / (1 + h * 0.5);
    this.shadow.scale.set((1.1 + Math.abs(Math.sin(pose.phi)) * 1.3) * s, 0.8 * s, 1);
    this.shadow.material.opacity = Math.max(0.3, s);
  }
}

export { KeeperController };
