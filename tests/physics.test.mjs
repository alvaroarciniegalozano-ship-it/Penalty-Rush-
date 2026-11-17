import { BallSim, solveLaunch } from '../js/physics.js';
const goal = { W: 7.12, H: 2.51, postR: 0.09, barR: 0.074, depth: 2.36, netTop: 2.5 };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
function shoot(tx, ty, speed, keeperCaps = null) {
  const b = new BallSim(goal);
  b.reset({ x: 0, y: 0.11, z: 11 });
  const s = solveLaunch(b.pos, { x: tx, y: ty, z: 0 }, speed);
  b.launch(s.vel);
  let t = 0;
  while (t < 5 && (!b.result || b.resultAge < 1.2)) { b.step(1 / 360, keeperCaps); t += 1 / 360; }
  return { b, s };
}
let r = shoot(0, 1.2, 25); ok(r.b.result === 'goal', 'centro 25 m/s => gol');
ok(Math.abs(r.b.crossing.x) < 0.05 && Math.abs(r.b.crossing.y - 1.2) < 0.12, `llega al objetivo (x=${r.b.crossing.x.toFixed(3)}, y=${r.b.crossing.y.toFixed(3)})`);
r = shoot(3.2, 2.2, 31); ok(r.b.result === 'goal', 'escuadra 31 m/s => gol');
console.log('   cruce', r.b.crossing);
r = shoot(-3.2, 0.2, 14); ok(r.b.result === 'goal', 'rasa lenta esquina => gol');
console.log('   cruce', r.b.crossing);
r = shoot(0, 1.2, 14); console.log('   tiempo vuelo 14 m/s', r.s.time.toFixed(2));
r = shoot(5.5, 1.0, 25); ok(r.b.result === 'miss', 'fuera por el lateral => miss (' + r.b.result + ')');
r = shoot(0, 3.8, 25); ok(r.b.result === 'miss', 'por encima => miss (' + r.b.result + ')');
// poste
r = shoot(3.56 + 0.09, 1.0, 25); ok(r.b.result === 'post' || r.b.result === 'goal', 'poste => ' + r.b.result + ' hitPost=' + r.b.hitPost);
r = shoot(3.7, 1.0, 25); ok(r.b.hitPost, 'toca el poste (x=3.7)');
r = shoot(0, 2.51 + 0.07, 25); ok(r.b.hitBar, 'toca el larguero, result=' + r.b.result);
// portero fijo: cápsula en el centro
const cap = [{ a: { x: 0, y: 0.1, z: 0.45 }, b: { x: 0, y: 1.6, z: 0.45 }, r: 0.3 }];
r = shoot(0, 1.0, 25, cap); ok(r.b.result === 'save', 'portero centrado ataja => ' + r.b.result);
r = shoot(2, 1.0, 25, cap); ok(r.b.result === 'goal', 'portero no llega a x=2 => ' + r.b.result);
// red: no sale
r = shoot(0, 1.2, 31); ok(r.b.pos.z >= -goal.depth - 0.001, 'la red detiene el balón z=' + r.b.pos.z.toFixed(2));
process.exit(fails ? 1 : 0);
