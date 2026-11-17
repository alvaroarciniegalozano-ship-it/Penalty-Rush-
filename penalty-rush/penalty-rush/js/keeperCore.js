// ============================================================================
//  Núcleo del portero (módulo puro, sin Three.js): modelo de pose, cápsulas
//  de colisión y cerebro/IA. La parte visual (keeper.js) solo aplica `pose`.
//
//  El portero NO conoce el destino del balón antes del disparo. Solo puede:
//   1) (nivel 3) "leer" el lado del tirador en los instantes previos al
//      golpe con una probabilidad limitada y un destino aproximado, y
//   2) observar la trayectoria real del balón tras un tiempo de reacción,
//      con ruido en su estimación.
//  Su alcance real lo determina la pose animada (cápsulas), no un dado.
// ============================================================================
import { predictAtPlane } from './physics.js';

export const KD = {
  hip: 0.95,        // altura de la cintura en reposo (m)
  shoulderUp: 0.32, // cintura -> hombros
  shoulderOut: 0.21,
  armLen: 0.62,
  headUp: 0.74,
  headR: 0.2,
  torsoUp: 0.5,
  torsoR: 0.27,
  legR: 0.11,
  legOut: 0.12,
  legLen: 0.93,
  armR: 0.15,       // radio efectivo de brazo + guante
};

const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) * (1 - u);

function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function readyPoseAt(x, spreadDeg = 10) {
  const sp = spreadDeg * DEG;
  return {
    hx: x,
    hy: KD.hip - KD.legLen * (1 - Math.cos(sp)),
    phi: 0,           // inclinación del cuerpo (rad, + hacia +X)
    gL: 36 * DEG,     // elevación del brazo del lado -X del mundo
    gR: 36 * DEG,     // elevación del brazo del lado +X del mundo
    spread: sp,       // apertura de piernas
    step: 0,          // fase del paso lateral (para el balanceo de piernas)
    armFwd: 0.35,     // brazos ligeramente adelantados
    lean: 0,
  };
}

function lerpPose(a, b, w) {
  return {
    hx: lerp(a.hx, b.hx, w), hy: lerp(a.hy, b.hy, w), phi: lerp(a.phi, b.phi, w),
    gL: lerp(a.gL, b.gL, w), gR: lerp(a.gR, b.gR, w), spread: lerp(a.spread, b.spread, w),
    step: lerp(a.step, b.step, w), armFwd: lerp(a.armFwd, b.armFwd, w), lean: lerp(a.lean, b.lean, w),
  };
}

export function capsulesFromPose(pose, z, vel) {
  const sp = Math.sin(pose.phi), cp = Math.cos(pose.phi);
  const a = { x: sp, y: cp };       // eje del cuerpo (hacia la cabeza)
  const rt = { x: cp, y: -sp };     // derecha del cuerpo (+X en reposo)
  const P = { x: pose.hx, y: pose.hy };
  const V = vel || { x: 0, y: 0, z: 0 };
  const caps = [];
  const pt = (o, k, m) => ({ x: o.x + (k.x || 0), y: o.y + (k.y || 0), z });
  const add = (A, B, r) => caps.push({ a: { x: A.x, y: A.y, z }, b: { x: B.x, y: B.y, z }, r, v: V });
  // torso
  add(P, { x: P.x + a.x * KD.torsoUp, y: P.y + a.y * KD.torsoUp }, KD.torsoR);
  // cabeza
  const H = { x: P.x + a.x * KD.headUp, y: P.y + a.y * KD.headUp };
  add(H, H, KD.headR);
  // piernas
  for (const s of [-1, 1]) {
    const top = { x: P.x + rt.x * s * KD.legOut, y: P.y + rt.y * s * KD.legOut };
    const dB = {
      x: rt.x * s * Math.sin(pose.spread) - a.x * Math.cos(pose.spread),
      y: rt.y * s * Math.sin(pose.spread) - a.y * Math.cos(pose.spread),
    };
    add(top, { x: top.x + dB.x * KD.legLen, y: top.y + dB.y * KD.legLen }, KD.legR);
  }
  // brazos: s=-1 => lado -X del mundo (gL); s=+1 => +X (gR)
  for (const s of [-1, 1]) {
    const g = s < 0 ? pose.gL : pose.gR;
    const S = {
      x: P.x + a.x * KD.shoulderUp + rt.x * s * KD.shoulderOut,
      y: P.y + a.y * KD.shoulderUp + rt.y * s * KD.shoulderOut,
    };
    // dirección en el marco del cuerpo: (s sin g, -cos g)
    const dx = s * Math.sin(g), dy = -Math.cos(g);
    const dir = { x: rt.x * dx + a.x * dy, y: rt.y * dx + a.y * dy };
    add(S, { x: S.x + dir.x * KD.armLen, y: S.y + dir.y * KD.armLen }, KD.armR);
  }
  return caps;
}

export class KeeperController {
  /**
   * @param params  KEEPER_AI[nivel]
   * @param goal    objeto con W,H,... (medidas de la portería)
   * @param zKeeper plano en el que se sitúa el portero
   */
  constructor(params, goal, zKeeper, rng = Math.random) {
    this.p = params;
    this.goal = goal;
    this.z = zKeeper;
    this.rng = rng;
    this.t = 0;
    this.reset(0);
  }

  reset(t) {
    this.phase = 'idle';           // idle | dive | lying | recover
    this.pose = readyPoseAt(0);
    this.vel = { x: 0, y: 0, z: 0 };
    this._prevPose = { ...this.pose };
    this.idleTarget = 0;
    this.nextIdle = t + 0.4;
    this.prepT0 = t;
    this.readyW = 0;               // 0..1: cuánto se ha "colocado" para el penal
    this.pending = false;
    this.decided = false;
    this.contactT = 0;
    this.decisionT = 0;
    this.early = null;
    this.dive = null;
    this.recoverFrom = null;
    this.recoverT0 = 0;
    this.recoverDur = 1;
    this.holdUntil = 0;
    this.stumbleDelay = 0;
    this.lastDive = null;
    this.t = t;
  }

  /** El portero está colocado y listo para el siguiente penal. */
  get ready() { return this.phase === 'idle' && this.t - this.prepT0 > 0.35; }

  /** Comienza la animación de preparación (previa al penal). */
  startPrep(t) { this.prepT0 = t; }

  /** Nueva ronda: se levanta si está en el suelo y vuelve al centro. */
  resetRound(t) {
    this.pending = false; this.decided = false; this.early = null;
    if (this.phase === 'idle') { this.prepT0 = t; return; }
    this.recoverFrom = { ...this.pose };
    this.recoverT0 = t;
    this.recoverDur = this.phase === 'recover' ? 0.8 : 1.0;
    this.phase = 'recover';
    this.dive = null;
    this.prepT0 = t + this.recoverDur;
  }

  /** El tirador inicia el golpeo (suelta el botón). `windup` = segundos hasta el contacto. */
  onShotStart(t, aim, windup) {
    this.contactT = t + windup;
    this.early = null;
    const p = this.p;
    if (p.cueAccuracy > 0 && this.phase === 'idle' && this.rng() < p.cueAccuracy) {
      // Lectura de la postura del tirador: solo percibe el lado, no la altura.
      const side = Math.abs(aim.x) > 0.7 ? Math.sign(aim.x) : 0;
      if (side !== 0) {
        this.early = {
          t0: this.contactT - p.cueLead,
          target: { x: side * (1.6 + this.rng() * 1.5), y: 0.4 + this.rng() * 1.2 },
          started: false,
        };
      }
    }
  }

  /** El balón sale despedido. A partir de aquí puede observar su trayectoria. */
  onLaunch(t) {
    this.contactT = t;
    const p = this.p;
    this.decisionT = t + p.reactionMin + this.rng() * (p.reactionMax - p.reactionMin);
    this.pending = true;
    this.decided = false;
    this.stumbleDelay = this.rng() < p.stumbleProb ? 0.12 + this.rng() * 0.2 : 0;
  }

  update(t, dt, ball) {
    this.t = t;
    const p = this.p;
    this._prevPose = this.pose;
    if (this.early && !this.early.started && t >= this.early.t0 && this.phase === 'idle') {
      this.early.started = true;
      this._startDive(t, this.early.target, true);
    }
    if (this.pending && !this.decided && t >= this.decisionT + this.stumbleDelay && ball) {
      this.decided = true;
      this._decide(t, ball);
    }
    switch (this.phase) {
      case 'idle': this._idle(t, dt); break;
      case 'dive': this._diveStep(t); break;
      case 'lying':
        this.pose = this._divePoseAt(this.dive, 1);
        if (t >= this.holdUntil) {
          this.recoverFrom = { ...this.pose };
          this.recoverT0 = t; this.recoverDur = 1.0;
          this.phase = 'recover';
          this.prepT0 = t + this.recoverDur;
        }
        break;
      case 'recover': {
        const u = clamp((t - this.recoverT0) / this.recoverDur, 0, 1);
        const target = readyPoseAt(0, 10);
        const e = smooth(u);
        const pose = lerpPose(this.recoverFrom, target, e);
        pose.step = this.recoverFrom.step + u * 4;
        this.pose = pose;
        if (u >= 1) { this.phase = 'idle'; this.idleTarget = 0; this.nextIdle = t + 0.3; }
        break;
      }
      default: break;
    }
    const inv = dt > 1e-6 ? 1 / dt : 0;
    this.vel = {
      x: (this.pose.hx - this._prevPose.hx) * inv,
      y: (this.pose.hy - this._prevPose.hy) * inv,
      z: 0,
    };
    return this.pose;
  }

  getColliders() {
    return capsulesFromPose(this.pose, this.z, this.vel);
  }

  // ---------------------------------------------------------------- reposo
  _idle(t, dt) {
    const p = this.p;
    const pose = this.pose;
    const W = this.goal.W;
    // Preparación previa al penal: se coloca (cuclillas + brazos abiertos)
    const prepAge = t - this.prepT0;
    this.readyW = clamp(prepAge / p.prepTime, 0, 1);
    if (t >= this.nextIdle && !this.pending) {
      this.idleTarget = clamp((this.rng() * 2 - 1) * p.idleAmp, -W / 2 + 0.5, W / 2 - 0.5);
      this.nextIdle = t + p.idlePeriod[0] + this.rng() * (p.idlePeriod[1] - p.idlePeriod[0]);
    }
    const dx = this.idleTarget - pose.hx;
    const maxStep = p.idleSpeed * dt;
    const mv = Math.abs(dx) < maxStep ? dx : Math.sign(dx) * maxStep;
    const hx = pose.hx + mv;
    const sway = Math.sin(t * 5.5) * 0.5 + 0.5;
    const spread = (8 + 7 * this.readyW + 3 * sway * this.readyW) * DEG;
    const wave = Math.sin(t * 7.0);
    const g = (34 + 22 * this.readyW + 6 * wave * this.readyW) * DEG;
    this.pose = {
      hx,
      hy: KD.hip - KD.legLen * (1 - Math.cos(spread)),
      phi: 0,
      gL: g, gR: g,
      spread,
      step: pose.step + Math.abs(mv) * 5.5,
      armFwd: 0.35 + 0.3 * this.readyW,
      lean: clamp(dx * 0.25, -0.12, 0.12),
    };
  }

  // ---------------------------------------------------------- decisión (IA)
  _decide(t, ball) {
    const p = this.p;
    const goal = this.goal;
    const pr = predictAtPlane(ball.pos, ball.vel, this.z);
    if (!pr) return;
    let x = pr.x + gauss(this.rng) * p.obsSigmaX;
    let y = pr.y + gauss(this.rng) * p.obsSigmaY;
    if (this.rng() < p.wrongWayProb) x = -x * (0.6 + this.rng() * 0.5) || (this.rng() < 0.5 ? -1.5 : 1.5);
    y = clamp(y, 0.1, goal.H + 0.2);
    const outside = Math.abs(x) > goal.W / 2 + 0.9 || y > goal.H + 0.6;
    // Un portero experto no se lanza a un balón que se va fuera; uno torpe a veces sí.
    if (outside && (p.cueAccuracy > 0 || this.rng() < 0.55)) return;
    if (this.early && this.early.started && this.phase !== 'idle') {
      // Ya estaba en movimiento por la lectura del tirador: ¿mismo lado?
      const cur = this.dive ? this.dive.side : 0;
      if (Math.sign(x) === cur && Math.abs(x) > 0.5) {
        this._startDive(t, { x, y }, false); // corrige/extiende la estirada
      } else if (t - this.dive.t0 < 0.14) {
        this._startDive(t, { x, y }, false); // aún puede cambiar de sentido
      } else {
        // demasiado tarde: sigue yendo al lado equivocado
      }
      return;
    }
    this._startDive(t, { x, y }, false);
  }

  _startDive(t, target, isEarly) {
    const p = this.p;
    const cur = this.pose;
    const L = (KD.shoulderUp + KD.armLen) * p.reach;
    const dxNeed = target.x - cur.hx;
    const s = target.x === cur.hx ? (this.rng() < 0.5 ? -1 : 1) : Math.sign(dxNeed);
    const ty = clamp(target.y, 0.1, 2.5);
    const tt = clamp((ty - 0.3) / 2.0, 0, 1);
    let phiEnd = lerp(82, 38, tt) * DEG;
    let hyEnd = lerp(0.32, KD.hip + 0.45, tt);
    let gEnd = 168 * DEG;
    let spreadEnd = 14 * DEG;
    let jump = 0.1 + 0.25 * tt;
    let hxEnd = target.x - s * Math.sin(phiEnd) * L;
    if (Math.abs(dxNeed) < 0.55) {
      // Balón casi centrado: bloqueo en el sitio (agachado o salto vertical)
      if (ty < 0.75) {
        phiEnd = 0; hyEnd = 0.62; gEnd = 28 * DEG; spreadEnd = 42 * DEG; jump = 0;
        hxEnd = target.x;
      } else {
        phiEnd = s * Math.asin(clamp(Math.abs(dxNeed) / L, 0, 0.6)) ;
        hyEnd = KD.hip + clamp(ty - 1.2, 0, 1) * 0.45 + 0.1;
        jump = 0.12;
        hxEnd = target.x - Math.sin(phiEnd) * L;
        spreadEnd = 8 * DEG;
      }
    } else {
      phiEnd *= s;
    }
    const maxX = this.goal.W / 2 + 0.3;
    hxEnd = clamp(hxEnd, -maxX, maxX);
    const dist = Math.abs(hxEnd - cur.hx);
    const dur = clamp(dist / p.diveSpeed + 0.12 + (isEarly ? 0.04 : 0), 0.28, 1.1);
    this.dive = {
      t0: t, dur, side: s,
      from: { ...cur }, hxEnd, hyEnd, phiEnd, gEnd, spreadEnd, jump,
      lying: Math.abs(phiEnd) > 60 * DEG || hyEnd < 0.7,
    };
    this.phase = 'dive';
    this.lastDive = { target: { x: target.x, y: ty }, ...this.dive };
  }

  _divePoseAt(d, u) {
    const f = d.from;
    const e = easeOut(u);
    const e2 = easeOut(clamp(u * 1.2, 0, 1));
    const sm = smooth(u);
    const ga = smooth(clamp(u * 2.2, 0, 1));
    return {
      hx: lerp(f.hx, d.hxEnd, e),
      hy: lerp(f.hy, d.hyEnd, sm) + d.jump * Math.sin(Math.PI * u) * (1 - 0.4 * u),
      phi: lerp(f.phi, d.phiEnd, e2),
      gL: lerp(f.gL, d.gEnd, ga), gR: lerp(f.gR, d.gEnd, ga),
      spread: lerp(f.spread, d.spreadEnd, ga),
      step: f.step + u * 2,
      armFwd: lerp(f.armFwd, 0.1, ga),
      lean: 0,
    };
  }

  _diveStep(t) {
    const d = this.dive;
    const u = clamp((t - d.t0) / d.dur, 0, 1);
    this.pose = this._divePoseAt(d, u);
    if (u >= 1) {
      this.phase = 'lying';
      this.holdUntil = t + (d.lying ? 0.9 : 0.55) + (this.p.stumbleProb > 0 ? 0.4 : 0);
    }
  }
}
