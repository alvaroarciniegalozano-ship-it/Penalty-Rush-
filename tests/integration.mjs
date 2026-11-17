// Prueba de integración de la lógica del juego con Three.js simulado (mock).
const errors = [];
const origErr = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ')); };
const listeners = {};
globalThis.window = { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1, addEventListener: (t, f) => (listeners[t] = f), AudioContext: undefined };
globalThis.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }), width: 0, height: 0 }), body: { classList: { add() {}, remove() {} } } };
globalThis.requestAnimationFrame = () => 0;
const calls = { toast: [], score: [], levelEnd: [], paused: [] };
const ui = new Proxy({}, { get: (t, k) => {
  if (k === 'toast') return (...a) => calls.toast.push(a);
  if (k === 'updateScore') return (...a) => calls.score.push(a);
  if (k === 'showLevelEnd') return (...a) => calls.levelEnd.push(a);
  if (k === 'setPaused') return (...a) => calls.paused.push(a);
  return () => {};
} });
const snd = [];
const audio = new Proxy({ muted: false }, { get: (t, k) => (k in t ? t[k] : (...a) => { snd.push(String(k)); }), set: (t, k, v) => { t[k] = v; return true; } });

const { loadAssets } = await import('../js/assets.js');
const { Game } = await import('../js/game.js');
const { LEVELS } = await import('../js/config.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const assets = await loadAssets();
const game = new Game({ canvas: {}, assets, ui, audio });
ok(Math.abs(game.report.world.S - 0.7825) < 0.01, `escala escenario S=${game.report.world.S.toFixed(4)}`);
ok(Math.abs(game.goal.W - 7.12) < 0.1 && Math.abs(game.goal.H - 2.51) < 0.1, `portería ${game.goal.W.toFixed(2)}x${game.goal.H.toFixed(2)} m, red ${game.goal.depth.toFixed(2)}`);
ok(Math.abs(game.report.ballScale - 0.22 / 1.3163) < 0.002, `escala balón ${game.report.ballScale.toFixed(4)}`);
ok(Math.abs(game.report.keeperScale - 0.4242) < 0.001, `escala portero ${game.report.keeperScale.toFixed(4)}`);

let ts = 0;
const frames = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { ts += 16.667; game.frame(ts); } };
game.last = 0;
const until = (pred, maxSec = 8) => { for (let i = 0; i < maxSec * 60; i++) { if (pred()) return true; frames(1 / 60); } return pred(); };
const move = (nx, ny) => game.onPointerMove((nx * 0.5 + 0.5) * 1600, (-ny * 0.5 + 0.5) * 900);

function shoot(nx, ny, hold) {
  move(nx, ny); frames(0.1);
  ok(until(() => game.canShoot, 4), 'puede disparar (ready)');
  game.onPointerDown(); frames(hold);
  const stCharging = game.state === 'charging';
  game.onPointerUp();
  return { stCharging, aim: { ...game.aim }, power: game.shot && game.shot.power };
}

// ------------------------------- Nivel 1 -------------------------------
game.startLevel(0);
ok(game.state === 'instructions', 'nivel 1: pantalla de instrucciones');
game.onKey('Enter');
ok(game.state === 'ready' && game.attempt === 1, 'ENTER inicia el nivel');
ok(!game.keeperRig.root.visible, 'nivel 1: sin portero');
let s = shoot(0, 0.15, 0.9);
ok(s.stCharging, 'clic mantenido => charging');
ok(game.state === 'kicking', 'soltar => kicking');
ok(game.power > 0.5 && game.power <= 1, `potencia acumulada ${game.power.toFixed(2)}`);
// no se puede disparar durante la animación
game.onPointerDown(); ok(game.state === 'kicking', 'no se puede cargar durante la patada'); game.onPointerUp();
ok(until(() => game.state === 'flight', 2), 'contacto => flight');
ok(until(() => game.state === 'result', 4), 'se decide resultado: ' + game.ballSim.result);
ok(['goal', 'miss', 'post'].includes(game.ballSim.result), 'resultado válido sin portero');
// pausa en pleno resultado
const pt0 = game.pt; game.onKey('Escape'); frames(0.5);
ok(game.paused && Math.abs(game.pt - pt0) < 1e-9, 'ESC pausa y congela la simulación');
game.onKey('Enter'); ok(!game.paused, 'ENTER reanuda');
ok(until(() => game.state === 'ready', 5) && game.attempt === 2, 'siguiente ronda automática (intento 2)');
// R reinicia el intento sin consumirlo
game.onKey('KeyR'); ok(game.state === 'ready' && game.attempt === 2, 'R reinicia el intento sin contarlo');
// disparo en pausa no permitido
game.onKey('Escape'); game.onPointerDown(); ok(game.state === 'ready', 'no se carga en pausa'); game.onPointerUp(); game.onKey('Escape');
// completar el resto de intentos
let guard = 0;
while (game.state !== 'levelend' && guard++ < 40000) {
  if (game.state === 'ready') shoot((Math.random() * 2 - 1) * 0.4, 0.2, 0.3 + Math.random());
  frames(0.2);
  if (game.state === 'result') game.onKey('Enter');
}
ok(game.state === 'levelend', `nivel 1 termina tras ${LEVELS[0].attempts} intentos (goles ${game.goals})`);
ok(calls.levelEnd.length >= 1 && calls.levelEnd.at(-1)[0].total === 10, 'pantalla de fin de nivel');

// ------------------------------- Niveles 2 y 3 -------------------------------
for (const idx of [1, 2]) {
  game.startLevel(idx); game.onKey('Enter');
  ok(game.keeperRig.root.visible && game.keeperCtl, `nivel ${idx + 1}: portero activo`);
  let seenDive = false, saves = 0, n = 0;
  guard = 0;
  while (game.state !== 'levelend' && guard++ < 4000) {
    if (game.state === 'ready') { shoot(idx === 2 ? 0.25 : 0, 0.12, 0.8); n++; }
    frames(0.05);
    if (game.keeperCtl && game.keeperCtl.phase === 'dive') seenDive = true;
    if (game.state === 'result') { if (game.ballSim.result === 'save') saves++; ok(Number.isFinite(game.keeperCtl.pose.hx) && Number.isFinite(game.keeperCtl.pose.hy), 'pose del portero finita'); frames(0.3); game.onKey('Enter'); }
  }
  ok(game.state === 'levelend', `nivel ${idx + 1} completo (${game.goals}/${game.level.attempts} goles, ${saves} atajadas)`);
  ok(seenDive, `nivel ${idx + 1}: el portero se lanza`);
}
// Volver al menú desde el fin de nivel y reentrar
game.toMenu(); ok(game.state === 'menu', 'toMenu');
game.startLevel(0); game.onKey('Enter'); ok(game.state === 'ready', 'reentrada a nivel 1');
game.onKey('Escape'); ok(game.paused, 'pausa'); game.toMenu(); ok(!game.paused && game.state === 'menu', 'menú desde pausa limpia la pausa');
ok(errors.length === 0, 'sin errores en el bucle: ' + errors.slice(0, 3).join(' | '));
ok(snd.includes('kick') && snd.includes('goal') || snd.includes('miss') || snd.includes('save'), 'se disparan sonidos: ' + [...new Set(snd)].join(','));
console.error = origErr;
process.exit(fails ? 1 : 0);
