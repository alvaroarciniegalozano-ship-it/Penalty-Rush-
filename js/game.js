// ============================================================================
//  PENALTY RUSH – lógica principal: renderer, cámara POV, apuntado, disparo,
//  máquina de estados, niveles y resultados.
//
//  Estados: menu | instructions | ready | charging | kicking | flight |
//           result | levelend      (+ bandera `paused`)
//  Solo se puede disparar en `ready` (y con el portero ya colocado).
// ============================================================================
import * as THREE from 'three';
import { REF, CAMERA, SHOT, LEVELS, KEEPER_AI, KEEPER_Z } from './config.js';
import { BallSim, solveLaunch } from './physics.js';
import { KeeperController } from './keeperCore.js';
import { createWorld, blobTexture } from './world.js';
import { BallView } from './ball.js';
import { KeeperRig } from './keeper.js';
import { PlayerRig } from './player.js';
import { analyzeModel } from './assets.js';

const PHYS_DT = 1 / 360;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Desviación típica (m) del disparo según la potencia: a partir de cierto punto se pierde precisión. */
export function scatterFor(power) {
  if (power <= SHOT.scatterStart) return 0.03;
  const k = (power - SHOT.scatterStart) / (1 - SHOT.scatterStart);
  return 0.03 + SHOT.scatterMax * k * k;
}

export class Game {
  constructor({ canvas, assets, ui, audio }) {
    this.canvas = canvas;
    this.assets = assets;
    this.ui = ui;
    this.audio = audio;

    // ---- renderer / escena / cámara ----
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // ---- informe de inspección de los 4 GLB ----
    this.report = {};
    for (const [name, gltf] of Object.entries(assets)) this.report[name] = analyzeModel(name, gltf);

    // ---- mundo y actores ----
    this.world = createWorld(this.scene, assets);
    this.goal = this.world.goal;
    this.report.world = this.world.report;
    this.spot = this.world.spot;
    this.shadowTex = blobTexture();

    this.ballSim = new BallSim(this.goal);
    this.ballSim.reset(this.spot);
    this.ballView = new BallView(assets.ball, this.shadowTex);
    this.ballView.addTo(this.scene);
    this.ballView.setPosition(this.spot);
    this.report.ballScale = this.ballView.scale;

    this.keeperRig = new KeeperRig(assets.keeper, this.shadowTex);
    this.keeperRig.addTo(this.scene);
    this.keeperRig.setVisible(false);
    this.keeperCtl = null;
    this.report.keeperScale = this.keeperRig.k;

    this.player = new PlayerRig(assets.limbs, this.camera);
    this.player.onContact = () => this.onContact();

    // ---- estado ----
    this.state = 'menu';
    this.paused = false;
    this.level = null;
    this.levelIdx = 0;
    this.attempt = 0;
    this.goals = 0;
    this.results = [];
    this.time = 0;       // tiempo de visualización
    this.pt = 0;         // tiempo de simulación (se detiene en pausa)
    this.acc = 0;
    this.power = 0;
    this.mouseDown = false;
    this.cursor = { x: 0, y: 0.1, nx: 0, ny: 0.1 };
    this.look = { x: 0, y: 0 };
    this.aim = { x: 0, y: 1.2 };
    this.shot = null;
    this.nextAt = 0;
    this.netPlayed = false;
    this.raycaster = new THREE.Raycaster();
    this._v2 = new THREE.Vector2();
    this._v3 = new THREE.Vector3();
    this.camZ = this.spot.z + CAMERA.backFromBall;
    this.stats = { goals: 0, saves: 0, misses: 0, posts: 0 };

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.last = performance.now();
    this._raf = (ts) => this.frame(ts);
    requestAnimationFrame(this._raf);
    this.updateCamera(0);
  }

  // ------------------------------------------------------------------ vista
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const a = w / h;
    this.camera.aspect = a;
    // mantiene un campo horizontal mínimo (~95°) en pantallas poco anchas
    let fov = CAMERA.fov;
    const hfov = 2 * Math.atan(Math.tan((fov * D2R) / 2) * a) / D2R;
    if (hfov < 95) fov = (2 * Math.atan(Math.tan((95 * D2R) / 2) / a)) / D2R;
    this.camera.fov = Math.min(fov, 100);
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt) {
    const k = dt > 0 ? Math.min(1, dt * 6) : 1;
    this.look.x += (this.cursor.nx - this.look.x) * k;
    this.look.y += (this.cursor.ny - this.look.y) * k;
    const rec = this.player.recoil;
    this.camera.position.set(0, REF.EYE_H + rec.y, this.camZ);
    this.camera.rotation.set(
      (CAMERA.pitchDeg + this.look.y * CAMERA.lookPitchDeg) * D2R + rec.pitch,
      -this.look.x * CAMERA.lookYawDeg * D2R,
      rec.roll
    );
    this.camera.updateMatrixWorld(true);
  }

  // --------------------------------------------------------------- apuntado
  /** Proyecta el cursor sobre el plano de la portería (z=0) → punto de impacto previsto. */
  computeAim() {
    this._v2.set(this.cursor.nx, this.cursor.ny);
    this.raycaster.setFromCamera(this._v2, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    const mx = this.goal.W / 2 + SHOT.aimMarginX;
    const myTop = this.goal.H + SHOT.aimMarginY;
    let x = 0, y = 0.05;
    if (d.z < -1e-4) {
      const t = (0 - o.z) / d.z;
      x = o.x + d.x * t;
      y = o.y + d.y * t;
    } else {
      y = myTop; // mira por encima de todo
    }
    this.aim.x = clamp(x, -mx, mx);
    this.aim.y = clamp(y, 0.05, myTop);
  }

  projectToScreen(x, y, z) {
    const v = this._v3.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  updateAimUI() {
    const showing = this.state === 'ready' || this.state === 'charging';
    if (!showing || this.paused) { this.ui.setReticle(0, 0, 0, false, 0); return; }
    const p = this.projectToScreen(this.aim.x, this.aim.y, 0);
    const p2 = this.projectToScreen(this.aim.x + 1, this.aim.y, 0);
    const ppm = Math.abs(p2.x - p.x);
    const sigma = scatterFor(Math.max(this.power, 0));
    this.ui.setReticle(p.x, p.y, sigma * 1.6 * ppm, true, this.power);
    const mx = this.goal.W / 2 + SHOT.aimMarginX, myTop = this.goal.H + SHOT.aimMarginY;
    this.ui.setMini((this.aim.x + mx) / (2 * mx), this.aim.y / myTop);
  }

  // ------------------------------------------------------------ flujo / niveles
  startLevel(idx) {
    this.levelIdx = idx;
    this.level = LEVELS[idx];
    this.attempt = 0;
    this.goals = 0;
    this.results = [];
    this.stats = { goals: 0, saves: 0, misses: 0, posts: 0 };
    this.paused = false;
    this.ui.setPaused(false);
    this.state = 'instructions';
    this.power = 0;
    this.mouseDown = false;
    this.audio.chargeStop();
    this.player.resetPose();
    this.resetBall();
    this.keeperRig.setVisible(this.level.keeper);
    if (this.level.keeper) {
      this.keeperCtl = new KeeperController(KEEPER_AI[this.level.id], this.goal, KEEPER_Z, Math.random);
      this.keeperCtl.reset(this.pt);
      this.keeperRig.apply(this.keeperCtl.pose);
    } else {
      this.keeperCtl = null;
    }
    this.ui.showInstructions(this.level);
    this.audio.levelChange();
    this.audio.startAmbient();
  }

  confirmInstructions() {
    if (this.state !== 'instructions') return;
    this.ui.showHud(this.level);
    this.ui.setMuteLabel(this.audio.muted);
    this.beginRound();
  }

  beginRound() {
    if (this.attempt >= this.level.attempts) { this.finishLevel(); return; }
    this.attempt++;
    this.state = 'ready';
    this.power = 0;
    this.shot = null;
    this.netPlayed = false;
    this.ui.hideToast();
    this.ui.setPower(0, false);
    this.audio.chargeStop();
    this.resetBall();
    this.player.resetPose();
    if (this.keeperCtl) { this.keeperCtl.resetRound(this.pt); this.keeperCtl.startPrep(this.pt); }
    this.ui.updateScore(this.goals, this.attempt, this.level.attempts, this.results);
    this.audio.whistle();
  }

  resetBall() {
    this.ballSim.reset(this.spot);
    this.ballView.setPosition(this.spot);
    this.ballView.resetSpin();
  }

  finishLevel() {
    this.state = 'levelend';
    this.ui.hideToast();
    this.ui.showLevelEnd({
      goals: this.goals, total: this.level.attempts, results: this.results,
      level: this.level, hasNext: this.levelIdx < LEVELS.length - 1,
    });
    this.audio.levelChange();
    document.body.classList.remove('aiming');
  }

  nextLevel() {
    if (this.levelIdx < LEVELS.length - 1) this.startLevel(this.levelIdx + 1);
    else this.toMenu();
  }

  restartLevel() { this.startLevel(this.levelIdx); }

  /** R: reinicia el intento actual (no cuenta como intento). */
  restartAttempt() {
    if (!this.level) return;
    if (this.state === 'ready' || this.state === 'charging' || this.state === 'kicking' || this.state === 'flight') {
      this.attempt--;
      this.beginRound();
    } else if (this.state === 'result') {
      this.nextAt = this.pt; // salta la espera
    } else if (this.state === 'levelend') {
      this.restartLevel();
    }
  }

  toMenu() {
    this.state = 'menu';
    this.paused = false;
    this.ui.setPaused(false);
    this.audio.chargeStop();
    this.player.resetPose();
    this.ui.showMenu();
  }

  // --------------------------------------------------------------- pausa
  isPlaying() {
    return ['ready', 'charging', 'kicking', 'flight', 'result'].includes(this.state);
  }
  setPaused(on) {
    if (on === this.paused) return;
    if (on && !this.isPlaying()) return;
    this.paused = on;
    this.ui.setPaused(on);
    if (on) {
      if (this.state === 'charging') this.cancelCharge();
      this.audio.suspend();
      document.body.classList.remove('aiming');
    } else {
      this.audio.resume();
      document.body.classList.add('aiming');
    }
  }
  togglePause() { this.setPaused(!this.paused); }

  // ------------------------------------------------------------------ entrada
  onPointerMove(cx, cy) {
    this.cursor.x = cx; this.cursor.y = cy;
    this.cursor.nx = (cx / window.innerWidth) * 2 - 1;
    this.cursor.ny = -(cy / window.innerHeight) * 2 + 1;
  }

  get canShoot() {
    return this.state === 'ready' && !this.paused && (!this.keeperCtl || this.keeperCtl.ready);
  }

  onPointerDown() {
    this.mouseDown = true;
    if (!this.canShoot) return;
    this.state = 'charging';
    this.power = 0;
    this.player.beginCharge();
    this.audio.chargeStart();
  }

  onPointerUp() {
    this.mouseDown = false;
    if (this.state === 'charging' && !this.paused) this.releaseShot();
  }

  cancelCharge() {
    this.state = 'ready';
    this.power = 0;
    this.player.cancelCharge();
    this.audio.chargeStop();
    this.ui.setPower(0, false);
  }

  releaseShot() {
    const power = clamp(Math.max(this.power, SHOT.minPower), 0, 1);
    this.computeAim();
    const aim = { x: this.aim.x, y: this.aim.y };
    const sigma = scatterFor(power);
    const target = {
      x: aim.x + gauss() * sigma,
      y: Math.max(0.04, aim.y + gauss() * sigma),
      z: 0,
    };
    const speed = SHOT.minSpeed + (SHOT.maxSpeed - SHOT.minSpeed) * power;
    const sol = solveLaunch(this.spot, target, speed);
    this.shot = { aim, power, target, speed, vel: sol.vel, time: sol.time };
    this.state = 'kicking';
    this.audio.chargeStop();
    this.ui.setPower(power, true);
    this.player.startKick(power);
    if (this.keeperCtl) this.keeperCtl.onShotStart(this.pt, aim, SHOT.windup);
  }

  /** El pie toca el balón (sincronizado con la animación): sale disparado. */
  onContact() {
    if (this.state !== 'kicking' || !this.shot) return;
    this.state = 'flight';
    this.ballSim.launch(this.shot.vel);
    this.audio.kick(this.shot.power);
    this.audio.whoosh(this.shot.time, this.shot.power);
    if (this.keeperCtl) this.keeperCtl.onLaunch(this.pt);
    this.ui.setPower(this.shot.power, false);
  }

  onKey(code) {
    switch (code) {
      case 'Escape':
        if (this.state === 'instructions') this.toMenu();
        else this.togglePause();
        break;
      case 'KeyR': this.restartAttempt(); break;
      case 'KeyM': this.setMuted(this.audio.toggleMute()); break;
      case 'Enter':
      case 'NumpadEnter':
        if (this.paused) this.setPaused(false);
        else if (this.state === 'instructions') this.confirmInstructions();
        else if (this.state === 'result') this.nextAt = this.pt;
        else if (this.state === 'levelend') this.nextLevel();
        break;
      case 'F2': this.toggleDebug(); break;
      default: break;
    }
  }

  setMuted(m) { this.ui.setMuteLabel(m); }

  toggleDebug() {
    this._debug = !this._debug;
    if (!this._debug) this.ui.showDebug('');
  }

  // --------------------------------------------------------------- resultados
  onResult(res) {
    this.state = 'result';
    const sh = this.shot;
    let text = '', sub = '', kind = res;
    if (res === 'goal') {
      this.goals++; this.stats.goals++;
      text = '¡GOL!';
      const corner = sh && Math.abs(sh.target.x) > this.goal.W / 2 - 0.9 && sh.target.y > this.goal.H - 0.8;
      sub = corner ? '¡AL ÁNGULO!' : sh && sh.power > 0.9 ? '¡CAÑONAZO!' : '¡Qué definición!';
      this.audio.goal();
      setTimeout(() => this.audio.netHit(), 60);
    } else if (res === 'save') {
      this.stats.saves++;
      text = '¡ATAJADA!'; sub = 'El portero detuvo el disparo';
    } else if (res === 'post') {
      this.stats.posts++;
      text = this.ballSim.hitBar ? '¡AL TRAVESAÑO!' : '¡AL POSTE!'; sub = '¡Por muy poco!';
      if (this.ballSim.hitBar && !this.ballSim.hitPost) sub = '¡Casi!';
    } else {
      this.stats.misses++;
      text = '¡FUERA!'; sub = 'El disparo se fue desviado';
      kind = 'miss';
      this.audio.miss();
    }
    this.results[this.attempt - 1] = res === 'post' ? 'post' : res;
    this.ui.toast(text, kind, sub);
    this.ui.updateScore(this.goals, this.attempt, this.level.attempts, this.results);
    this.nextAt = this.pt + (res === 'goal' ? 2.6 : 2.1);
  }

  // ------------------------------------------------------------------- bucle
  physStep() {
    this.pt += PHYS_DT;
    const ball = this.ballSim;
    if (this.keeperCtl) this.keeperCtl.update(this.pt, PHYS_DT, ball.launched ? ball : null);
    const playing = this.state === 'flight' || this.state === 'result';
    if (playing && ball.launched) {
      const caps = this.keeperCtl ? this.keeperCtl.getColliders() : null;
      ball.step(PHYS_DT, caps);
      for (const ev of ball.events) {
        if (ev === 'bounce' && ball.speed > 2.5) this.audio.bounce();
        else if (ev === 'post' || ev === 'bar') this.audio.post();
        else if (ev === 'save') this.audio.save();
      }
      if (this.state === 'flight' && ball.result) this.onResult(ball.result);
    }
    if (this.state === 'result' && this.pt >= this.nextAt) {
      this.nextAt = Infinity;
      if (this.attempt >= this.level.attempts) this.finishLevel();
      else this.beginRound();
    }
  }

  tick(dt) {
    this.time += dt;
    this.world.update(this.time);

    // potencia de carga
    if (this.state === 'charging') {
      this.power = clamp(this.power + dt / SHOT.chargeTime, 0, 1);
      this.player.setCharge(this.power);
      this.audio.chargeUpdate(this.power);
      this.ui.setPower(this.power, true);
    }
    // apuntado (se congela al disparar)
    if (this.state === 'ready' || this.state === 'charging') this.computeAim();

    // simulación física con paso fijo
    this.acc += dt;
    let n = 0;
    while (this.acc >= PHYS_DT && n < 40) { this.physStep(); this.acc -= PHYS_DT; n++; }
    if (n >= 40) this.acc = 0;

    // animaciones y vistas
    this.player.update(dt, this.ballSim.launched ? this.spot : this.ballSim.pos);
    this.updateCamera(dt);
    if (this.keeperCtl) this.keeperRig.apply(this.keeperCtl.pose);
    this.ballView.setPosition(this.ballSim.pos);
    if (this.ballSim.launched) this.ballView.spin(this.ballSim.vel, dt);
  }

  frame(ts) {
    requestAnimationFrame(this._raf);
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    try {
      if (this.state !== 'menu' && this.state !== 'instructions' && this.state !== 'levelend') {
        if (!this.paused) this.tick(dt);
        this.updateAimUI();
      } else {
        // fuera de juego: cámara y mundo siguen vivos (nubes) pero sin simulación
        this.time += dt;
        this.world.update(this.time);
        this.updateCamera(dt);
        this.ui.setReticle(0, 0, 0, false, 0);
      }
      if (this.state !== 'menu') this.renderer.render(this.scene, this.camera);
      if (this._debug) this.updateDebug(dt);
    } catch (err) {
      console.error('[PenaltyRush] error en el bucle:', err);
    }
  }

  updateDebug(dt) {
    const r = this.report;
    const f = (a) => a.map((v) => v.toFixed(2)).join(' × ');
    const lines = [
      `FPS ${(1 / Math.max(dt, 1e-4)).toFixed(0)} | estado ${this.state}${this.paused ? ' (pausa)' : ''} | Three ${window.__THREE_SOURCE} r${THREE.REVISION}`,
      `Escala escenario S=${r.world.S.toFixed(4)} | portería ${this.goal.W.toFixed(2)} × ${this.goal.H.toFixed(2)} m | red ${this.goal.depth.toFixed(2)} m`,
      `Balón escala ${r.ballScale.toFixed(4)} | portero escala ${r.keeperScale.toFixed(4)}`,
      ...['stadium', 'keeper', 'ball', 'limbs'].map((n) => `${n}: ${f(r[n].size)} u · ${r[n].meshes} mallas · ${r[n].tris} tris · esqueleto ${r[n].hasSkeleton} · anim ${r[n].animations.length}`),
      `aim (${this.aim.x.toFixed(2)}, ${this.aim.y.toFixed(2)}) potencia ${this.power.toFixed(2)}`,
    ];
    if (this.keeperCtl) lines.push(`portero fase ${this.keeperCtl.phase} x=${this.keeperCtl.pose.hx.toFixed(2)}`);
    this.ui.showDebug(lines.join('\n'));
  }
}
