// ============================================================================
//  Interfaz (DOM): menú, instrucciones, HUD, pausa y fin de nivel.
// ============================================================================

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      loading: $('loading'), loadFill: $('loadFill'), loadText: $('loadText'), loadError: $('loadError'),
      menu: $('menu'), menuBg: $('menuBg'),
      ins: $('instructions'), insLevelNum: $('insLevelNum'), insLevelName: $('insLevelName'), insBlurb: $('insBlurb'), insGoal: $('insGoal'),
      hud: $('hud'), hudLevel: $('hudLevel'), hudGoals: $('hudGoals'), hudAttempts: $('hudAttempts'), hudPips: $('hudPips'),
      reticle: $('reticle'), ring: document.querySelector('#reticle .ring'),
      power: $('power'), powerFill: $('powerFill'), powerPct: $('powerPct'),
      miniDot: $('miniDot'), toast: $('toast'), hint: $('hint'), debug: $('debug'),
      pause: $('pause'), pSound: $('pSound'),
      levelend: $('levelend'), leTag: $('leTag'), leTitle: $('leTitle'), leGoals: $('leGoals'), leAttempts: $('leAttempts'),
      lePips: $('lePips'), leMsg: $('leMsg'), leNext: $('leNext'),
      menuSound: $('menuSound'), btnSound: $('btnSound'),
    };
    this._toastTimer = 0;
    this.drawMenuBackground();
    window.addEventListener('resize', () => this.drawMenuBackground());
  }

  // ---- carga ----
  setLoading(p, text) {
    this.el.loadFill.style.width = `${Math.round(p * 100)}%`;
    if (text) this.el.loadText.textContent = text;
  }
  showLoadError(msg) {
    this.el.loadError.classList.remove('hidden');
    this.el.loadError.textContent = msg;
    this.el.loadText.textContent = 'No se pudo cargar el juego';
  }
  hideLoading() { this.el.loading.classList.add('hidden'); }

  // ---- pantallas ----
  hideAll() {
    for (const k of ['menu', 'ins', 'hud', 'pause', 'levelend']) this.el[k].classList.add('hidden');
    document.body.classList.remove('aiming');
  }
  showMenu() { this.hideAll(); this.el.menu.classList.remove('hidden'); this.drawMenuBackground(); }
  showInstructions(level) {
    this.hideAll();
    this.el.ins.classList.remove('hidden');
    this.el.insLevelNum.textContent = `NIVEL ${level.id}`;
    this.el.insLevelName.textContent = level.name;
    this.el.insBlurb.textContent = level.blurb;
    this.el.insGoal.textContent = level.keeper
      ? `Tienes ${level.attempts} penales. ¡Marca todos los goles que puedas!`
      : `Tienes ${level.attempts} intentos para practicar. Sin portero.`;
  }
  showHud(level) {
    this.hideAll();
    this.el.hud.classList.remove('hidden');
    this.el.hudLevel.textContent = `NIVEL ${level.id} · ${level.name}`;
    document.body.classList.add('aiming');
  }
  setPaused(on) { this.el.pause.classList.toggle('hidden', !on); }
  setMuteLabel(muted) {
    const icon = muted ? '🔇' : '🔊';
    this.el.btnSound.textContent = icon;
    this.el.menuSound.textContent = `${icon} SONIDO (M)`;
    this.el.pSound.textContent = `SONIDO: ${muted ? 'DESACTIVADO' : 'ACTIVADO'}`;
  }

  // ---- HUD ----
  updateScore(goals, attempt, total, results) {
    this.el.hudGoals.textContent = String(goals);
    this.el.hudAttempts.innerHTML = `${Math.min(attempt, total)}<em>/${total}</em>`;
    this.renderPips(this.el.hudPips, total, results);
  }
  renderPips(container, total, results) {
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('i');
      d.className = 'pip' + (results[i] ? ' ' + results[i] : '');
      container.appendChild(d);
    }
  }
  setReticle(px, py, radiusPx, visible, power) {
    const r = this.el.reticle;
    r.classList.toggle('hidden', !visible);
    if (!visible) return;
    r.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    const d = Math.max(34, radiusPx * 2);
    this.el.ring.style.width = this.el.ring.style.height = `${d.toFixed(1)}px`;
    this.el.ring.style.margin = `${(-d / 2).toFixed(1)}px 0 0 ${(-d / 2).toFixed(1)}px`;
    r.classList.toggle('charging', power > 0.02);
    r.classList.toggle('max', power > 0.9);
  }
  setPower(p, visible) {
    this.el.power.classList.toggle('hidden', !visible);
    this.el.powerFill.style.height = `${(p * 100).toFixed(1)}%`;
    this.el.powerPct.textContent = `${Math.round(p * 100)}%`;
  }
  setMini(nx, ny) {
    // nx, ny en 0..1 dentro de la zona apuntable (0,0 = esquina inferior izquierda)
    this.el.miniDot.style.left = `${(nx * 100).toFixed(1)}%`;
    this.el.miniDot.style.top = `${((1 - ny) * 100).toFixed(1)}%`;
  }
  toast(text, kind, sub = '') {
    const t = this.el.toast;
    t.className = kind;
    t.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    // reinicia la animación
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    t.classList.remove('hidden');
  }
  hideToast() { this.el.toast.classList.add('hidden'); }

  // ---- fin de nivel ----
  showLevelEnd({ goals, total, results, level, hasNext }) {
    this.hideAll();
    this.el.levelend.classList.remove('hidden');
    const ratio = goals / total;
    let title = '¡SIGUE PRACTICANDO!', msg = 'Prueba con distintas potencias y zonas de la portería.';
    if (ratio >= 0.8) { title = '¡CRACK DEL PENAL!'; msg = 'Puntería de campeón. ¡Atrévete con el siguiente reto!'; }
    else if (ratio >= 0.5) { title = '¡BUEN TRABAJO!'; msg = 'Vas por buen camino. Con un poco más de precisión llegas a la cima.'; }
    this.el.leTag.textContent = `NIVEL ${level.id} · ${level.name}`;
    this.el.leTitle.textContent = title;
    this.el.leGoals.textContent = String(goals);
    this.el.leAttempts.textContent = String(total);
    this.el.leMsg.textContent = msg;
    this.renderPips(this.el.lePips, total, results);
    this.el.leNext.classList.toggle('hidden', !hasNext);
  }

  showDebug(text) {
    this.el.debug.textContent = text;
    this.el.debug.classList.toggle('hidden', !text);
  }

  // ---- fondo del menú: malla triangular low poly con campo y sol ----
  drawMenuBackground() {
    const cv = this.el.menuBg;
    if (!cv) return;
    const W = (cv.width = window.innerWidth);
    const H = (cv.height = window.innerHeight);
    const g = cv.getContext('2d');
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cols = Math.ceil(W / 90) + 2, rows = Math.ceil(H / 80) + 2;
    const cw = W / (cols - 2), rh = H / (rows - 2);
    const pts = [];
    for (let j = 0; j < rows; j++) {
      pts[j] = [];
      for (let i = 0; i < cols; i++) {
        pts[j][i] = [(i - 1) * cw + (rnd() - 0.5) * cw * 0.7 + (j % 2) * cw * 0.5, (j - 1) * rh + (rnd() - 0.5) * rh * 0.7];
      }
    }
    const horizon = H * 0.5;
    const sky = (y) => {
      const t = Math.min(1, Math.max(0, y / horizon));
      return [Math.round(24 + 90 * t), Math.round(120 + 90 * t), Math.round(220 + 25 * t)];
    };
    const grass = (y, k) => {
      const t = Math.min(1, Math.max(0, (y - horizon) / (H - horizon)));
      return [Math.round(30 + 25 * t + k), Math.round(120 + 55 * t + k * 1.4), Math.round(25 + 10 * t)];
    };
    const tri = (a, b, c) => {
      const cy = (a[1] + b[1] + c[1]) / 3;
      const k = (rnd() - 0.5) * 22;
      let col;
      if (cy < horizon) { const s = sky(cy); col = [s[0] + k, s[1] + k, s[2] + k * 0.5]; }
      else col = grass(cy, k);
      g.fillStyle = `rgb(${col.map((v) => Math.max(0, Math.min(255, v | 0))).join(',')})`;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath(); g.fill();
      g.strokeStyle = g.fillStyle; g.lineWidth = 1; g.stroke();
    };
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i], d = pts[j + 1][i + 1];
        if (j % 2 === 0) { tri(a, b, c); tri(b, d, c); } else { tri(a, b, d); tri(a, d, c); }
      }
    }
    // césped a franjas en perspectiva
    g.save();
    g.globalAlpha = 0.1; g.fillStyle = '#000';
    for (let i = -5; i < 5; i += 2) {
      g.beginPath();
      g.moveTo(W * 0.5 + i * W * 0.03, horizon); g.lineTo(W * 0.5 + (i + 1) * W * 0.03, horizon);
      g.lineTo(W * 0.5 + (i + 1) * W * 0.22, H); g.lineTo(W * 0.5 + i * W * 0.22, H);
      g.closePath(); g.fill();
    }
    g.restore();
    // líneas del campo en perspectiva
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(3, W / 360);
    g.beginPath();
    g.moveTo(W * 0.5 - W * 0.15, horizon + 10); g.lineTo(W * 0.5 + W * 0.15, horizon + 10); // línea de gol
    g.moveTo(W * 0.5 - W * 0.15, horizon + 10); g.lineTo(W * 0.5 - W * 0.38, H);
    g.moveTo(W * 0.5 + W * 0.15, horizon + 10); g.lineTo(W * 0.5 + W * 0.38, H);
    g.moveTo(W * 0.5 - W * 0.26, H * 0.74); g.lineTo(W * 0.5 + W * 0.26, H * 0.74);
    g.stroke();
    // portería
    g.globalAlpha = 0.55; g.strokeStyle = '#fff'; g.lineWidth = Math.max(4, W / 280);
    const gw = W * 0.12, gh = H * 0.085, gx = W * 0.5 - gw / 2, gy = horizon + 10 - gh;
    g.strokeRect(gx, gy, gw, gh);
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.55)';
    for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(gx + (gw * i) / 10, gy); g.lineTo(gx + (gw * i) / 10, gy + gh); g.stroke(); }
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(gx, gy + (gh * i) / 4); g.lineTo(gx + gw, gy + (gh * i) / 4); g.stroke(); }
    g.globalAlpha = 1;
    // sol facetado
    const sx = W * 0.84, sy = H * 0.17, sr = Math.min(W, H) * 0.075;
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
      g.fillStyle = k % 2 ? '#ffe36a' : '#ffd21c';
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a0) * sr, sy + Math.sin(a0) * sr); g.lineTo(sx + Math.cos(a1) * sr, sy + Math.sin(a1) * sr); g.fill();
    }
    // viñeta
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,20,60,.45)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}
