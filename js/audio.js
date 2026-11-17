// ============================================================================
//  Audio sintetizado con Web Audio API (sin archivos externos).
//  Todos los sonidos se generan con osciladores y ruido filtrado.
// ============================================================================

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('pr_muted') === '1'; } catch (e) { /* sin storage */ }
    this._ambient = null;
    this._charge = null;
    this._noiseBuf = null;
  }

  /** Debe llamarse dentro de un gesto del usuario (clic / tecla). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    // 2 s de ruido blanco reutilizable
    const len = this.ctx.sampleRate * 2;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('pr_muted', m ? '1' : '0'); } catch (e) { /* sin storage */ }
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 0.8, t, 0.03);
    }
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ----------------------------------------------------------- utilidades
  _noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.005, when = 0, freqEnd = null } = {}) {
    if (!this.ctx) return null;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
    return { src, g, f };
  }

  _tone(freq, dur, { type = 'sine', gain = 0.2, when = 0, freqEnd = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // -------------------------------------------------------------- ambiente
  startAmbient() {
    if (!this.ctx || this._ambient) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 0.5;
    const g = this.ctx.createGain(); g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.11, this.ctx.currentTime + 1.5);
    // murmullo de multitud: LFO lento sobre la ganancia
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.17;
    const lg = this.ctx.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    // pájaros / aire suave
    this._ambient = { src, g, lfo };
    this._birdTimer = setInterval(() => {
      if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
      if (Math.random() < 0.35) {
        const f = 2400 + Math.random() * 900;
        this._tone(f, 0.09, { type: 'sine', gain: 0.012, freqEnd: f * 1.3 });
        this._tone(f * 1.1, 0.08, { type: 'sine', gain: 0.01, when: 0.11, freqEnd: f * 1.4 });
      }
    }, 2500);
  }

  stopAmbient() {
    if (!this._ambient) return;
    try {
      const t = this.ctx.currentTime;
      this._ambient.g.gain.cancelScheduledValues(t);
      this._ambient.g.gain.setTargetAtTime(0, t, 0.2);
      const a = this._ambient;
      setTimeout(() => { try { a.src.stop(); a.lfo.stop(); } catch (e) { /* ya parado */ } }, 800);
    } catch (e) { /* noop */ }
    clearInterval(this._birdTimer);
    this._ambient = null;
  }

  // ---------------------------------------------------------------- efectos
  click() { this._tone(620, 0.06, { type: 'square', gain: 0.07 }); this._tone(930, 0.07, { type: 'square', gain: 0.05, when: 0.04 }); }

  chargeStart() {
    if (!this.ctx || this._charge) return;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.1);
    o.connect(lp); lp.connect(g); g.connect(this.master); o.start();
    this._charge = { o, g };
  }
  chargeUpdate(p) {
    if (!this._charge) return;
    const t = this.ctx.currentTime;
    this._charge.o.frequency.setTargetAtTime(90 + 330 * p, t, 0.04);
    this._charge.g.gain.setTargetAtTime(0.04 + 0.05 * p, t, 0.04);
  }
  chargeStop() {
    if (!this._charge) return;
    const c = this._charge; this._charge = null;
    const t = this.ctx.currentTime;
    c.g.gain.cancelScheduledValues(t);
    c.g.gain.setTargetAtTime(0.0001, t, 0.03);
    try { c.o.stop(t + 0.2); } catch (e) { /* noop */ }
  }

  kick(power = 0.7) {
    this._tone(170, 0.14, { type: 'sine', gain: 0.5, freqEnd: 45 });
    this._noise(0.07, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.35 * (0.5 + power) });
    this._tone(90, 0.1, { type: 'triangle', gain: 0.25, freqEnd: 50 });
  }
  whoosh(dur = 0.5, power = 0.7) {
    this._noise(Math.max(0.2, dur), { type: 'bandpass', freq: 900 + 900 * power, q: 1.2, gain: 0.12, attack: dur * 0.3, freqEnd: 350 });
  }
  netHit() {
    this._noise(0.45, { type: 'lowpass', freq: 1500, q: 0.7, gain: 0.35, attack: 0.01, freqEnd: 250 });
    this._noise(0.25, { type: 'highpass', freq: 3500, q: 0.5, gain: 0.1, attack: 0.005 });
    this._tone(110, 0.2, { type: 'sine', gain: 0.25, freqEnd: 60 });
  }
  save() {
    this._noise(0.1, { type: 'bandpass', freq: 2400, q: 1.4, gain: 0.45 });
    this._tone(210, 0.16, { type: 'triangle', gain: 0.4, freqEnd: 90 });
    this._tone(140, 0.2, { type: 'sine', gain: 0.3, freqEnd: 70, when: 0.02 });
  }
  post() {
    for (const [f, g] of [[880, 0.28], [1320, 0.14], [1760, 0.08], [2410, 0.05]]) {
      this._tone(f, 0.7, { type: 'sine', gain: g, freqEnd: f * 0.985 });
    }
    this._noise(0.05, { type: 'highpass', freq: 3000, q: 0.5, gain: 0.25 });
  }
  bounce() { this._tone(140, 0.08, { type: 'sine', gain: 0.2, freqEnd: 70 }); }

  goal() {
    // ovación (ruido filtrado que crece) + fanfarria corta
    this._noise(2.4, { type: 'bandpass', freq: 750, q: 0.7, gain: 0.5, attack: 0.5 });
    this._noise(2.0, { type: 'bandpass', freq: 1700, q: 0.9, gain: 0.22, attack: 0.4 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone(f, 0.28, { type: 'square', gain: 0.07, when: 0.05 + i * 0.1 });
      this._tone(f * 2, 0.22, { type: 'triangle', gain: 0.05, when: 0.05 + i * 0.1 });
    });
    this._tone(1046.5, 0.7, { type: 'square', gain: 0.07, when: 0.5 });
  }
  miss() {
    // "uuuh" de la grada + trombón descendente
    this._noise(1.3, { type: 'bandpass', freq: 420, q: 1.0, gain: 0.28, attack: 0.3, freqEnd: 240 });
    this._tone(330, 0.5, { type: 'sawtooth', gain: 0.06, freqEnd: 180 });
    this._tone(247, 0.6, { type: 'sawtooth', gain: 0.06, freqEnd: 130, when: 0.25 });
  }
  levelChange() {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone(f, 0.22, { type: 'square', gain: 0.08, when: i * 0.09 });
      this._tone(f / 2, 0.22, { type: 'triangle', gain: 0.08, when: i * 0.09 });
    });
    this._tone(1046.5, 0.8, { type: 'square', gain: 0.07, when: 0.5 });
    this._noise(0.9, { type: 'bandpass', freq: 1200, q: 0.8, gain: 0.15, attack: 0.2, when: 0.4 });
  }
  whistle() {
    this._tone(2600, 0.28, { type: 'sine', gain: 0.1, freqEnd: 2750 });
    this._tone(2800, 0.28, { type: 'sine', gain: 0.07, when: 0.01, freqEnd: 2900 });
  }
}
