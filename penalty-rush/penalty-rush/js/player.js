// ============================================================================
//  Protagonista en primera persona. "Brazos y piernas.glb" no tiene esqueleto
//  ni animaciones: cada extremidad (brazo, pierna, pie) es una pieza articulada
//  alrededor de su pivote (hombro, rodilla, tobillo) y TODO cuelga de la cámara,
//  por lo que permanece en su sitio al cambiar la orientación de la vista.
//  No hay torso ni cabeza.
// ============================================================================
import * as THREE from 'three';
import { REF, LIMBS_SRC as L, POV, SHOT } from './config.js';
import { toLowPoly, makePivotGroup } from './assets.js';

const D = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => u * u * (3 - 2 * u);
const easeIn3 = (u) => u * u * u;
const easeOut2 = (u) => 1 - (1 - u) * (1 - u);

const cloneP = (p) => ({ pos: p.pos.slice(), tilt: p.tilt, yaw: p.yaw, foot: p.foot });
const lerpP = (a, b, t) => ({
  pos: [lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t)],
  tilt: lerp(a.tilt, b.tilt, t), yaw: lerp(a.yaw, b.yaw, t), foot: lerp(a.foot, b.foot, t),
});

export class PlayerRig {
  constructor(gltf, camera) {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    // Escala del protagonista = escala del portero (misma altura de personaje)
    this.K = REF.KEEPER_H / (4.318 + 0.043);
    toLowPoly(model, { flat: true });
    this.camera = camera;

    const mk = (names, pivot) => makePivotGroup(model, names, pivot);
    this.armR = mk(L.parts.armR, L.shoulderR).wrapper;
    this.armL = mk(L.parts.armL, L.shoulderL).wrapper;
    // piernas con el pie anidado: el pie pivota en el tobillo, la pierna en la rodilla
    const legL = makePivotGroup(model, L.parts.legL, L.kneeL, { names: L.parts.footL, pivot: L.ankleL });
    const legR = makePivotGroup(model, L.parts.legR, L.kneeR, { names: L.parts.footR, pivot: L.ankleR });
    this.legL = legL.wrapper; this.legR = legR.wrapper;
    this.footL = legL.subInner; this.footR = legR.subInner;

    this.root = new THREE.Group();
    for (const w of [this.armL, this.armR, this.legL, this.legR]) {
      w.scale.setScalar(this.K);
      w.rotation.order = 'YXZ';
      this.root.add(w);
    }
    camera.add(this.root);

    // vector tobillo->punta de la bota y rodilla->tobillo (unidades GLB)
    this.toeFromAnkle = new THREE.Vector3(0, 0.02 - L.ankleR[1], -0.40);
    this.ankleFromKnee = new THREE.Vector3(L.ankleR[0] - L.kneeR[0], L.ankleR[1] - L.kneeR[1], L.ankleR[2] - L.kneeR[2]);

    this.state = 'rest';       // rest | charging | kick
    this.charge = 0;
    this.time = 0;
    this.kickT = 0;
    this.kickStart = null;
    this.contacted = false;
    this.onContact = null;
    this.ballCam = new THREE.Vector3();
    this.recoil = { pitch: 0, roll: 0, x: 0, y: 0 };
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.power = 0.7;

    // fases de la patada (s). Contacto exactamente en SHOT.windup.
    this.tBack = SHOT.windup * 0.66;
    this.tContact = SHOT.windup;
    this.tFollow = this.tContact + 0.26;
    this.tReturn = this.tFollow + 0.6;

    this.rest = {
      legL: cloneP(POV.legL), legR: cloneP(POV.legR),
    };
    this.apply(this.restPose());
  }

  restPose() {
    const breathe = Math.sin(this.time * 1.8) * 0.006;
    const p = {
      legL: cloneP(POV.legL), legR: cloneP(POV.legR),
      armL: { pos: POV.armL.pos.slice(), tilt: POV.armL.tilt, yaw: POV.armL.yaw, roll: POV.armL.roll },
      armR: { pos: POV.armR.pos.slice(), tilt: POV.armR.tilt, yaw: POV.armR.yaw, roll: POV.armR.roll },
    };
    p.armL.pos[1] += breathe; p.armR.pos[1] += breathe;
    return p;
  }

  get busy() { return this.state === 'kick'; }

  beginCharge() { if (this.state === 'rest') { this.state = 'charging'; this.charge = 0; } }
  setCharge(p) { this.charge = p; }
  cancelCharge() { if (this.state === 'charging') { this.state = 'rest'; this.charge = 0; } }

  /** Suelta el disparo: arranca la secuencia (el contacto ocurre en SHOT.windup). */
  startKick(power) {
    this.power = power;
    this.state = 'kick';
    this.kickT = 0;
    this.contacted = false;
    this.kickStart = this._currentRightLeg();
  }

  resetPose() {
    this.state = 'rest'; this.charge = 0; this.kickT = 0; this.contacted = false;
    this.recoil.pitch = this.recoil.roll = this.recoil.x = this.recoil.y = 0;
  }

  _backPose() {
    return { pos: [0.31, -0.36, -0.06], tilt: 36, yaw: 8, foot: -12 };
  }

  _currentRightLeg() {
    // pose de la pierna derecha mientras se carga (se retrasa según la potencia)
    const rest = cloneP(POV.legR);
    const back = this._backPose();
    return lerpP(rest, back, smooth(clamp(this.charge, 0, 1)) * 0.85);
  }

  /** Posición de la rodilla para que la punta de la bota toque el balón. */
  _contactPose(ballCam) {
    const tilt = 76, yaw = 0, foot = -6;
    this._e.set(tilt * D, yaw * D, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    // punta respecto a la rodilla (en espacio de la pierna, sin escala)
    const toe = this._v.copy(this.toeFromAnkle)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), foot * D)
      .add(this.ankleFromKnee)
      .multiplyScalar(this.K)
      .applyQuaternion(this._q);
    // la punta toca la cara posterior del balón, ligeramente por debajo del centro
    const target = new THREE.Vector3(ballCam.x * 0.9 + 0.04, ballCam.y - 0.02, ballCam.z + REF.BALL_D / 2 + 0.01);
    return { pos: [target.x - toe.x, target.y - toe.y, target.z - toe.z], tilt, yaw, foot };
  }

  /**
   * @param dt          segundos de simulación
   * @param ballWorld   posición del balón (mundo) para sincronizar el contacto
   */
  update(dt, ballWorld) {
    this.time += dt;
    const pose = this.restPose();
    // balón en espacio de cámara
    this.camera.updateMatrixWorld(true);
    this.ballCam.copy(ballWorld);
    this.camera.worldToLocal(this.ballCam);

    if (this.state === 'charging') {
      const c = clamp(this.charge, 0, 1);
      pose.legR = this._currentRightLeg();
      // braceo: los brazos oscilan, más fuerte cuanto más potencia
      const amp = 4 + 18 * c;
      const w = this.time * (5 + 6 * c);
      pose.armR.tilt += amp * Math.sin(w); pose.armL.tilt -= amp * Math.sin(w);
      pose.armR.yaw += amp * 0.4 * Math.sin(w * 0.5);
      pose.armL.yaw -= amp * 0.4 * Math.sin(w * 0.5);
      pose.armR.pos[1] += 0.03 * c * Math.sin(w); pose.armL.pos[1] -= 0.03 * c * Math.sin(w);
      pose.legL.tilt += 3 * c; // apoyo
    } else if (this.state === 'kick') {
      this.kickT += dt;
      const t = this.kickT;
      const back = this._backPose();
      let leg;
      let swing = 0; // 0..1 amplitud del braceo
      if (t < this.tBack) {
        leg = lerpP(this.kickStart, back, smooth(t / this.tBack));
        swing = 0.35 * smooth(t / this.tBack);
      } else if (t < this.tContact) {
        const u = (t - this.tBack) / (this.tContact - this.tBack);
        leg = lerpP(back, this._contactPose(this.ballCam), easeIn3(u));
        swing = lerp(0.35, 1, smooth(u));
      } else if (t < this.tFollow) {
        const c = this._contactPose(this.ballCam);
        const f = { pos: [c.pos[0] - 0.03, c.pos[1] + 0.16, c.pos[2] - 0.40], tilt: 90, yaw: -4, foot: 28 };
        leg = lerpP(c, f, easeOut2((t - this.tContact) / (this.tFollow - this.tContact)));
        swing = 1;
      } else {
        const c = this._contactPose(this.ballCam);
        const f = { pos: [c.pos[0] - 0.03, c.pos[1] + 0.16, c.pos[2] - 0.40], tilt: 90, yaw: -4, foot: 28 };
        const u = clamp((t - this.tFollow) / (this.tReturn - this.tFollow), 0, 1);
        leg = lerpP(f, cloneP(POV.legR), smooth(u));
        swing = 1 - smooth(u);
        if (u >= 1) { this.state = 'rest'; }
      }
      pose.legR = leg;
      // braceo opuesto a la pierna que golpea
      pose.armL.tilt += 26 * swing; pose.armR.tilt -= 20 * swing;
      pose.armL.yaw += 8 * swing; pose.armR.yaw -= 8 * swing;
      pose.armL.pos[2] -= 0.08 * swing; pose.armR.pos[2] += 0.06 * swing;
      pose.legL.tilt -= 3 * swing;
      // contacto exacto con el balón
      if (!this.contacted && t >= this.tContact) {
        this.contacted = true;
        this.recoil.pitch = 0.05; this.recoil.roll = (Math.random() - 0.5) * 0.02;
        this.recoil.y = -0.02;
        if (this.onContact) this.onContact();
      }
    }

    // retroceso de cámara (muelle amortiguado)
    this.recoil.pitch *= Math.exp(-dt * 9);
    this.recoil.roll *= Math.exp(-dt * 8);
    this.recoil.y *= Math.exp(-dt * 8);
    this.apply(pose);
  }

  _setLimb(w, p, isArm) {
    w.position.set(p.pos[0], p.pos[1], p.pos[2]);
    w.rotation.set(p.tilt * D, p.yaw * D, isArm ? (p.roll || 0) * D : 0);
  }

  apply(pose) {
    this._setLimb(this.armL, pose.armL, true);
    this._setLimb(this.armR, pose.armR, true);
    this._setLimb(this.legL, pose.legL, false);
    this._setLimb(this.legR, pose.legR, false);
    this.footL.rotation.set(pose.legL.foot * D, 0, 0);
    this.footR.rotation.set(pose.legR.foot * D, 0, 0);
  }
}

