import { Group, Mesh, Color, MeshLambertMaterial, Object3D } from './mock-three.mjs';
import { PropertyBinding } from './mock-three.mjs';
const mk = (names, userBox) => {
  const g = new Group();
  for (const n of names) {
    const m = new Mesh({ attributes: { position: { count: 9 } }, index: null }, new MeshLambertMaterial({ color: 0x88cc44 }));
    m.name = PropertyBinding.sanitizeNodeName(n); m.userData = { name: n };
    g.add(m);
  }
  return g;
};
const MODELS = {
  'assets/models/stadium.glb': () => { const g = mk(['Plane', 'Plane.001', 'Plane.002', 'Plane.003']); g.children[0].userBox = { min: [-8.373, 0.466, -8.442], max: [-5.354, 3.884, 1.101] }; return g; },
  'assets/models/keeper.glb': () => { const g = mk(['Plane', 'Plane.001', 'Plane.002', 'Plane.003', 'Plane.004', 'Plane.005', 'Plane.006', 'Plane.007', 'Plane.009', 'Plane.010', 'Cube', 'Plane.011', 'Plane.013']); g.userBox = { min: [-0.238, -0.043, -0.439], max: [1.644, 4.318, 0.327] }; return g; },
  'assets/models/ball.glb': () => { const g = mk(['Icosphere']); g.userBox = { min: [-0.657, -0.658, -0.66], max: [0.657, 0.658, 0.66] }; return g; },
  'assets/models/limbs.glb': () => { const g = mk(['Plane.021', 'Plane.020', 'Plane.019', 'Plane.018', 'Plane.017', 'Plane.016', 'Plane.015', 'Plane.014', 'Plane.008', 'Plane.001']); g.userBox = { min: [0.505, -0.005, -0.411], max: [2.679, 3.056, 0.269] }; return g; },
};
export class GLTFLoader {
  async loadAsync(url, onProgress) {
    const f = MODELS[url]; if (!f) throw new Error('modelo no encontrado: ' + url);
    if (onProgress) onProgress({ lengthComputable: true, loaded: 1, total: 1 });
    return { scene: f(), animations: [] };
  }
}
