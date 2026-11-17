// ============================================================================
//  Vista del balón: usa BALÓN.glb escalado a 0.22 m de diámetro, con giro
//  según la velocidad y sombra suave bajo el balón (sin sombras duras).
// ============================================================================
import * as THREE from 'three';
import { REF } from './config.js';
import { toLowPoly } from './assets.js';

export class BallView {
  constructor(gltf, shadowTex) {
    this.group = new THREE.Group();
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Escala uniforme: el diámetro medio del GLB pasa a 0.22 m (sin deformar)
    const diameter = (size.x + size.y + size.z) / 3;
    this.scale = REF.BALL_D / diameter;
    this.diameterGLB = diameter;
    toLowPoly(model, { flat: true });
    const holder = new THREE.Group();
    model.position.sub(center);        // centra la geometría en el origen del balón
    holder.add(model);
    holder.scale.setScalar(this.scale);
    this.spinGroup = new THREE.Group();
    this.spinGroup.add(holder);
    this.group.add(this.spinGroup);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;
    this.q = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
  }

  addTo(scene) { scene.add(this.group); scene.add(this.shadow); }

  setPosition(pos) {
    this.group.position.set(pos.x, pos.y, pos.z);
    const h = Math.max(0, pos.y - 0.11);
    const s = 0.42 / (1 + h * 0.7);
    this.shadow.position.x = pos.x; this.shadow.position.z = pos.z;
    this.shadow.scale.set(s, s, s);
    this.shadow.material.opacity = Math.max(0.25, 1 / (1 + h * 0.8));
  }

  /** Rodadura/giro: la velocidad angular es v × up / r. */
  spin(vel, dt, r = REF.BALL_D / 2) {
    const sp = Math.hypot(vel.x, vel.z);
    if (sp < 0.02) return;
    this.axis.set(vel.z, 0, -vel.x).normalize();
    this.q.setFromAxisAngle(this.axis, (sp / r) * dt);
    this.spinGroup.quaternion.premultiply(this.q);
  }

  resetSpin() { this.spinGroup.quaternion.identity(); }
}
