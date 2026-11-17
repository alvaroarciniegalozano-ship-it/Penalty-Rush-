import { BallSim, solveLaunch } from '../js/physics.js';
import { KeeperController } from '../js/keeperCore.js';
import { KEEPER_AI, KEEPER_Z, SHOT } from '../js/config.js';
const goal = { W: 7.12, H: 2.51, postR: 0.09, barR: 0.074, depth: 2.36, netTop: 2.5 };
// RNG con semilla
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function scatter(power, rng){ if(power<=SHOT.scatterStart) return 0.03; const k=(power-SHOT.scatterStart)/(1-SHOT.scatterStart); return 0.03+SHOT.scatterMax*k*k; }
function gauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function runShot(level, aim, power, rng){
  const ai = KEEPER_AI[level];
  const k = new KeeperController(ai, goal, KEEPER_Z, rng);
  const b = new BallSim(goal); b.reset({x:0,y:0.11,z:11});
  let t=0; const dt=1/360;
  // preparación 1s
  for(;t<1.0;t+=dt) k.update(t,dt,null);
  const sg = scatter(power,rng);
  const tgt = { x: aim.x + gauss(rng)*sg, y: Math.max(0.05, aim.y + gauss(rng)*sg), z:0 };
  const speed = SHOT.minSpeed + (SHOT.maxSpeed-SHOT.minSpeed)*power;
  const sol = solveLaunch(b.pos, tgt, speed);
  k.onShotStart(t, aim, SHOT.windup);
  const tc = t + SHOT.windup;
  let launched=false, tEnd=0;
  while (t < tc + 5){
    if(!launched && t>=tc){ b.launch(sol.vel); k.onLaunch(t); launched=true; }
    k.update(t,dt,b.launched?b:{pos:b.pos,vel:b.vel});
    b.step(dt, k.getColliders());
    t+=dt;
    if(b.result && b.resultAge>0.1) break;
  }
  return b.result || 'miss';
}
function batch(level, name, gen, n=600){
  const rng = mulberry(1234+level);
  const c={goal:0,save:0,post:0,miss:0};
  for(let i=0;i<n;i++){ const {aim,power}=gen(rng); c[runShot(level,aim,power,rng)]++; }
  const on = c.goal+c.save; 
  console.log(`L${level} ${name.padEnd(26)} gol ${(100*c.goal/n).toFixed(0)}%  atajada ${(100*c.save/n).toFixed(0)}%  poste ${(100*c.post/n).toFixed(0)}%  fuera ${(100*c.miss/n).toFixed(0)}%`);
}
const Wh=goal.W/2;
const gens = {
  'aleatorio dentro, pot 50-100': r=>({aim:{x:(r()*2-1)*(Wh-0.3), y:0.2+r()*2.0}, power:0.5+r()*0.5}),
  'esquinas (|x|>2.8), pot 80-95': r=>({aim:{x:(r()<.5?-1:1)*(2.8+r()*0.6), y:0.2+r()*2.0}, power:0.8+r()*0.15}),
  'escuadras (y>1.9), pot 85': r=>({aim:{x:(r()<.5?-1:1)*(2.6+r()*0.7), y:1.9+r()*0.35}, power:0.85}),
  'centro pot 100': r=>({aim:{x:(r()*2-1)*0.5, y:0.5+r()*1.2}, power:1.0}),
  'rasos esquina pot 70': r=>({aim:{x:(r()<.5?-1:1)*(2.8+r()*0.6), y:0.1+r()*0.3}, power:0.7}),
  'suave centro pot 30': r=>({aim:{x:(r()*2-1)*2, y:0.5+r()*1.2}, power:0.3}),
};
const only = process.argv[2] ? +process.argv[2] : null;
for (const lv of [2,3]) { if(only && only!==lv) continue; for (const [n,g] of Object.entries(gens)) batch(lv,n,g); }
