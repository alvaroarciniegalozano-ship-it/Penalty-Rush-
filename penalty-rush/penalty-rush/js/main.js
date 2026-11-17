// ============================================================================
//  Arranque: carga los modelos, crea el juego y conecta teclado, ratón y botones.
//  (assets.js y game.js se importan dinámicamente para poder mostrar un error
//   claro si Three.js no se pudo cargar.)
// ============================================================================
import { UI } from './ui.js';
import { GameAudio } from './audio.js';

const ui = new UI();
const audio = new GameAudio();
const canvas = document.getElementById('game');
let game = null;

const $ = (id) => document.getElementById(id);

function toggleMute() {
  const m = audio.toggleMute();
  ui.setMuteLabel(m);
}

function bindUI() {
  // Menú principal: cada botón carga directamente su nivel
  document.querySelectorAll('.lvl-btn').forEach((b) => {
    b.addEventListener('click', () => {
      audio.init(); audio.click();
      game.startLevel(Number(b.dataset.level) - 1);
    });
  });
  $('menuSound').addEventListener('click', () => { audio.init(); toggleMute(); });

  $('insStart').addEventListener('click', () => { audio.click(); game.confirmInstructions(); });
  $('insBack').addEventListener('click', () => { audio.click(); game.toMenu(); });

  $('btnPause').addEventListener('click', () => { audio.click(); game.togglePause(); });
  $('btnRestart').addEventListener('click', () => { audio.click(); game.restartLevel(); });
  $('btnSound').addEventListener('click', toggleMute);
  $('btnMenu').addEventListener('click', () => { audio.click(); game.toMenu(); });

  $('pResume').addEventListener('click', () => { audio.click(); game.setPaused(false); });
  $('pRestart').addEventListener('click', () => { audio.click(); game.restartLevel(); });
  $('pSound').addEventListener('click', toggleMute);
  $('pMenu').addEventListener('click', () => { audio.click(); game.toMenu(); });

  $('leNext').addEventListener('click', () => { audio.click(); game.nextLevel(); });
  $('leRetry').addEventListener('click', () => { audio.click(); game.restartLevel(); });
  $('leMenu').addEventListener('click', () => { audio.click(); game.toMenu(); });

  // Quita el foco de los botones tras pulsarlos (evita que ENTER los reactive)
  document.addEventListener('click', (e) => { if (e.target && e.target.blur) e.target.blur(); });
}

function bindInput() {
  window.addEventListener('mousemove', (e) => game.onPointerMove(e.clientX, e.clientY));
  window.addEventListener('mousedown', (e) => {
    audio.init();
    if (e.button === 0 && e.target === canvas) { game.onPointerDown(); e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) game.onPointerUp(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    audio.init();
    const handled = ['Escape', 'KeyR', 'KeyM', 'Enter', 'NumpadEnter', 'F2'];
    if (game.state === 'menu') {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n !== undefined) { audio.click(); game.startLevel(n); e.preventDefault(); return; }
    }
    if (handled.includes(e.code)) { game.onKey(e.code); e.preventDefault(); }
  });
  // Si la ventana pierde el foco: pausa automática y se suelta el clic
  window.addEventListener('blur', () => {
    game.mouseDown = false;
    if (game.isPlaying() && !game.paused) game.setPaused(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.isPlaying() && !game.paused) game.setPaused(true);
  });
}

async function boot() {
  try {
    ui.setLoading(0.02, 'Cargando motor 3D…');
    const { loadAssets } = await import('./assets.js');
    const { Game } = await import('./game.js');
    const assets = await loadAssets((p) => ui.setLoading(0.05 + p * 0.85, 'Cargando modelos 3D…'));
    ui.setLoading(0.95, 'Preparando el escenario…');
    await new Promise((r) => setTimeout(r, 30)); // deja pintar la barra
    game = new Game({ canvas, assets, ui, audio });
    window.__PR = { game, ui, audio };
    bindUI();
    bindInput();
    ui.setMuteLabel(audio.muted);
    // Informe de inspección en consola (dimensiones, ejes, esqueletos, animaciones)
    console.info('[PenaltyRush] Inspección de modelos', game.report);
    ui.setLoading(1, '¡Listo!');
    setTimeout(() => { ui.hideLoading(); ui.showMenu(); }, 250);
  } catch (err) {
    console.error('[PenaltyRush] error de arranque', err);
    const hint = location.protocol === 'file:'
      ? '\n\nAbre el juego mediante un servidor local (ver README): los navegadores bloquean la carga de modelos desde file://.'
      : '\n\nComprueba que existe la carpeta assets/models y que hay conexión para cargar Three.js (o usa libs/three, ver README).';
    ui.showLoadError(`${err && err.message ? err.message : err}${hint}`);
  }
}

boot();
