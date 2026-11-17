export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: new URL('./mock-three.mjs', import.meta.url).href, shortCircuit: true };
  if (spec === 'three/addons/loaders/GLTFLoader.js') return { url: new URL('./mock-gltfloader.mjs', import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
