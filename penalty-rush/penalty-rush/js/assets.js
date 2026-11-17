// ============================================================================
//  Carga e inspección de los GLB. Todos los modelos se cargan UNA sola vez
//  desde assets/models (rutas relativas) y se reutilizan.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_PATHS } from './config.js';

let cache = null;

/** Carga los cuatro GLB. onProgress(0..1, nombre) */
export async function loadAssets(onProgress) {
  if (cache) return cache;
  const loader = new GLTFLoader();
  const names = Object.keys(MODEL_PATHS);
  const loaded = {};
  const totals = {};
  const report = () => {
    let l = 0, t = 0;
    for (const n of names) { l += loaded[n] || 0; t += totals[n] || 0; }
    return t > 0 ? l / t : 0;
  };
  const results = await Promise.all(names.map(async (name) => {
    const gltf = await loader.loadAsync(MODEL_PATHS[name], (e) => {
      if (e.lengthComputable) {
        loaded[name] = e.loaded; totals[name] = e.total;
        if (onProgress) onProgress(report(), name);
      }
    });
    loaded[name] = totals[name] = Math.max(totals[name] || 0, 1);
    if (onProgress) onProgress(report(), name);
    return [name, gltf];
  }));
  cache = Object.fromEntries(results);
  return cache;
}

/** Nombre original del nodo en Blender (GLTFLoader sanea los nombres: quita los puntos). */
export function origName(o) {
  return (o.userData && o.userData.name) || o.name;
}

export function byOrigName(root, name) {
  const san = THREE.PropertyBinding.sanitizeNodeName(name);
  let found = null;
  root.traverse((o) => {
    if (found) return;
    if ((o.userData && o.userData.name === name) || o.name === name || o.name === san) found = o;
  });
  return found;
}

/** Informe de inspección de un GLB: dimensiones, centro, esqueleto, animaciones... */
export function analyzeModel(name, gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let meshes = 0, tris = 0, skinned = 0;
  const mats = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      if (o.isSkinnedMesh) skinned++;
      const idx = o.geometry.index;
      tris += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid));
    }
  });
  return {
    name,
    size: size.toArray().map((v) => +v.toFixed(3)),
    min: box.min.toArray().map((v) => +v.toFixed(3)),
    max: box.max.toArray().map((v) => +v.toFixed(3)),
    center: center.toArray().map((v) => +v.toFixed(3)),
    meshes, tris: Math.round(tris), materials: mats.size,
    skinnedMeshes: skinned,
    animations: gltf.animations.map((a) => a.name),
    hasSkeleton: skinned > 0,
  };
}

/** Convierte materiales a Lambert facetado: look low-poly mate y uniforme. */
export function toLowPoly(root, { flat = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => {
      const nm = new THREE.MeshLambertMaterial({
        color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
        map: m.map || null,
        side: THREE.DoubleSide,
        flatShading: flat,
      });
      nm.name = m.name;
      if (nm.map) { nm.map.anisotropy = 8; }
      return nm;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    o.frustumCulled = true;
  });
}

/**
 * Agrupa piezas de un GLB bajo un pivote. Las piezas conservan su posición
 * visual; el pivote queda en el origen del `wrapper` devuelto (útil para rotar
 * brazos/piernas alrededor de hombro/cadera sin tocar la geometría).
 * Opcionalmente anida un sub-grupo (p. ej. el pie, con pivote en el tobillo).
 * @param root   escena del GLB (identidad)
 * @param names  nombres originales de las piezas
 * @param pivot  [x,y,z] del pivote en coordenadas del GLB
 * @param sub    sub-grupo anidado: objeto con names y pivot (coords. del GLB)
 * @returns objeto con wrapper, inner y subInner
 */
export function makePivotGroup(root, names, pivot, sub = null) {
  const inner = new THREE.Group();
  inner.position.fromArray(pivot);
  root.add(inner);
  let subInner = null;
  if (sub) {
    subInner = new THREE.Group();
    subInner.position.set(sub.pivot[0] - pivot[0], sub.pivot[1] - pivot[1], sub.pivot[2] - pivot[2]);
    inner.add(subInner);
  }
  root.updateMatrixWorld(true);
  const grab = (list, target) => {
    for (const n of list) {
      const m = byOrigName(root, n);
      if (!m) { console.warn('[PenaltyRush] pieza no encontrada:', n); continue; }
      target.attach(m);
    }
  };
  grab(names, inner);
  if (sub) grab(sub.names, subInner);
  root.remove(inner);
  inner.position.set(0, 0, 0);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  return { wrapper, inner, subInner };
}
