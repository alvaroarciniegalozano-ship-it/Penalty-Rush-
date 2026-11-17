// ============================================================================
//  Física del balón (módulo puro, sin dependencias de Three.js: se puede
//  probar en Node). Sistema lógico: X lateral, Y altura, Z profundidad,
//  línea de gol en Z = 0, red hacia -Z.
// ============================================================================

export const GRAV = 9.81;
export const BALL_R = 0.11;

export function solveLaunch(from, target, speed, g = GRAV) {
  // Calcula la velocidad inicial para que el balón, lanzado con rapidez
  // `speed`, pase por `target` (arco bajo). Devuelve {vel, time, reachable}.
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dh = Math.hypot(dx, dz);
  const dy = target.y - from.y;
  const a = (g * dh * dh) / (2 * speed * speed);
  const disc = dh * dh - 4 * a * (dy + a);
  let T;
  let reachable = true;
  if (disc >= 0) {
    T = (dh - Math.sqrt(disc)) / (2 * a); // tan(alfa), solución rasante
  } else {
    T = dh / (2 * a); // inalcanzable: ángulo de máximo alcance
    reachable = false;
  }
  const cosA = 1 / Math.sqrt(1 + T * T);
  const sinA = T * cosA;
  const ux = dx / dh;
  const uz = dz / dh;
  const vel = { x: ux * speed * cosA, y: speed * sinA, z: uz * speed * cosA };
  return { vel, time: dh / (speed * cosA), reachable };
}

export function predictAtPlane(pos, vel, zPlane, g = GRAV) {
  // Extrapolación balística (sin rebotes) hasta el plano z = zPlane.
  if (Math.abs(vel.z) < 1e-6) return null;
  const t = (zPlane - pos.z) / vel.z;
  if (t < 0) return null;
  return {
    t,
    x: pos.x + vel.x * t,
    y: pos.y + vel.y * t - 0.5 * g * t * t,
  };
}

function closestOnSegment(p, a, b, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-12 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  out.x = a.x + abx * t;
  out.y = a.y + aby * t;
  out.z = a.z + abz * t;
  return out;
}

export class BallSim {
  /**
   * @param goal  objeto con W,H,postR,barR,depth,netTop: medidas reales de la portería (m)
   */
  constructor(goal, radius = BALL_R) {
    this.goal = goal;
    this.r = radius;
    this.pos = { x: 0, y: radius, z: 11 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.frameCaps = this._buildFrame();
    this._tmp = { x: 0, y: 0, z: 0 };
    this.reset({ x: 0, y: radius, z: 11 });
  }

  _buildFrame() {
    const { W, H, postR, barR } = this.goal;
    const xp = W / 2 + postR;
    const zc = -postR;
    const top = H + 2 * barR;
    return [
      { a: { x: -xp, y: 0, z: zc }, b: { x: -xp, y: top, z: zc }, r: postR, kind: 'post' },
      { a: { x: xp, y: 0, z: zc }, b: { x: xp, y: top, z: zc }, r: postR, kind: 'post' },
      { a: { x: -xp, y: H + barR, z: zc }, b: { x: xp, y: H + barR, z: zc }, r: barR, kind: 'bar' },
    ];
  }

  reset(pos) {
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.prev = { ...this.pos };
    this.age = 0;
    this.launched = false;
    this.result = null;       // 'goal' | 'save' | 'post' | 'miss'
    this.resultAge = 0;       // tiempo transcurrido desde que se decidió
    this.hitPost = false;
    this.hitBar = false;
    this.saved = false;
    this.inNet = false;
    this.events = [];         // 'post','bar','save','bounce','net','goal'
    this.crossing = null;
    this.spin = { x: 0, y: 0, z: 0 };
  }

  launch(vel) {
    this.vel = { x: vel.x, y: vel.y, z: vel.z };
    this.launched = true;
    this.age = 0;
  }

  _collideCapsule(cap, restitution, bodyVel) {
    const c = closestOnSegment(this.pos, cap.a, cap.b, this._tmp);
    let nx = this.pos.x - c.x, ny = this.pos.y - c.y, nz = this.pos.z - c.z;
    let d = Math.hypot(nx, ny, nz);
    const minD = this.r + cap.r;
    if (d >= minD) return false;
    if (d < 1e-6) { nx = 0; ny = 1; nz = 0; d = 1; }
    nx /= d; ny /= d; nz /= d;
    this.pos.x = c.x + nx * minD;
    this.pos.y = c.y + ny * minD;
    this.pos.z = c.z + nz * minD;
    const bv = bodyVel || { x: 0, y: 0, z: 0 };
    const rvx = this.vel.x - bv.x, rvy = this.vel.y - bv.y, rvz = this.vel.z - bv.z;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn < 0) {
      const j = -(1 + restitution) * vn;
      this.vel.x += j * nx;
      this.vel.y += j * ny;
      this.vel.z += j * nz;
      // pérdida tangencial
      this.vel.x *= 0.94; this.vel.z *= 0.94;
    }
    return true;
  }

  _netCollisions(prev) {
    const { W, depth, netTop } = this.goal;
    const r = this.r;
    const p = this.pos, v = this.vel;
    const inDepth = p.z < 0.02 && p.z > -depth - r;
    // Red trasera (solo si el balón ya está dentro del volumen)
    if (p.z < 0 && Math.abs(p.x) < W / 2 + 0.3 && p.y < netTop + r) {
      if (p.z < -depth + r) {
        p.z = -depth + r;
        if (v.z < 0) { v.z = -v.z * 0.08; v.x *= 0.5; v.y *= 0.5; this.events.push('net'); }
      }
    }
    // Techo de la red
    if (inDepth && Math.abs(p.x) < W / 2 + 0.3 && p.z < 0 && p.y > netTop - r && prev.y <= netTop - r + 0.2) {
      p.y = netTop - r;
      if (v.y > 0) { v.y = -v.y * 0.1; this.events.push('net'); }
    }
    // Laterales de la red (a ambos lados: no se atraviesan)
    const xs = W / 2 + 0.12;
    if (p.z < 0 && p.z > -depth && p.y < netTop) {
      const ax = Math.abs(p.x), pax = Math.abs(prev.x);
      const sgn = p.x >= 0 ? 1 : -1;
      if (pax <= xs && ax > xs - r) { // dentro, intenta salir
        p.x = sgn * (xs - r);
        if (v.x * sgn > 0) { v.x = -v.x * 0.1; this.events.push('net'); }
      } else if (pax > xs && ax < xs + r) { // fuera, intenta entrar
        p.x = sgn * (xs + r);
        if (v.x * sgn < 0) { v.x = -v.x * 0.1; }
      }
    }
  }

  /**
   * Avanza dt segundos. keeperCaps: [{a,b,r,v?}] cápsulas del portero.
   */
  step(dt, keeperCaps) {
    const p = this.pos, v = this.vel, r = this.r;
    this.events.length = 0;
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z;
    const prev = this.prev;
    if (!this.launched) return;
    this.age += dt;
    if (this.result) this.resultAge += dt;

    v.y -= GRAV * dt;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;

    // Suelo
    if (p.y < r) {
      p.y = r;
      if (v.y < -0.9) {
        v.y = -v.y * 0.6;
        v.x *= 0.88; v.z *= 0.88;
        this.events.push('bounce');
      } else {
        v.y = 0;
      }
    }
    if (p.y <= r + 0.002) {
      const f = Math.max(0, 1 - (this.inNet ? 5.0 : 0.55) * dt);
      v.x *= f; v.z *= f;
    } else {
      // resistencia del aire muy ligera
      const f = Math.max(0, 1 - (this.inNet ? 3.0 : 0.012) * dt);
      v.x *= f; v.y *= f; v.z *= f;
    }

    // Postes y larguero
    for (const cap of this.frameCaps) {
      if (this._collideCapsule(cap, 0.55)) {
        if (cap.kind === 'post') this.hitPost = true; else this.hitBar = true;
        this.events.push(cap.kind);
      }
    }

    // Portero
    if (keeperCaps && !this.saved) {
      for (const cap of keeperCaps) {
        if (this._collideCapsule(cap, 0.32, cap.v)) {
          this.saved = true;
          this.events.push('save');
          if (!this.result) this._setResult('save');
          break;
        }
      }
    } else if (keeperCaps && this.saved) {
      for (const cap of keeperCaps) this._collideCapsule(cap, 0.3, cap.v);
    }

    // Cruce de la línea de gol (el centro del balón)
    if (prev.z > 0 && p.z <= 0 && !this.crossing) {
      const t = prev.z / (prev.z - p.z);
      const cx = prev.x + (p.x - prev.x) * t;
      const cy = prev.y + (p.y - prev.y) * t;
      this.crossing = { x: cx, y: cy };
      const { W, H } = this.goal;
      const inside = Math.abs(cx) < W / 2 && cy < H;
      if (!this.result) {
        if (inside && !this.saved) { this._setResult('goal'); this.events.push('goal'); }
        else this._setResult(this.hitPost || this.hitBar ? 'post' : 'miss');
      }
    }
    this.inNet = this.result === 'goal' || (p.z < 0 && Math.abs(p.x) < this.goal.W / 2 + 0.2 && p.y < this.goal.netTop);

    this._netCollisions(prev);

    // Rebote en poste/larguero hacia fuera => 'post' (sin gol)
    if (!this.result && (this.hitPost || this.hitBar) && v.z > 0 && p.z > 0.3) {
      this._setResult('post');
    }
    // Fin de jugada sin resultado: balón detenido, fuera del campo o tiempo
    if (!this.result) {
      const sp = Math.hypot(v.x, v.y, v.z);
      if ((sp < 0.35 && p.y <= r + 0.01 && this.age > 0.4) || this.age > 6 ||
          p.z > 30 || Math.abs(p.x) > 40) {
        this._setResult(this.hitPost || this.hitBar ? 'post' : 'miss');
      }
    }
  }

  _setResult(r) {
    this.result = r;
    this.resultAge = 0;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z); }
}
