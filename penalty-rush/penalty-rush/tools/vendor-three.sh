#!/usr/bin/env bash
# Descarga Three.js r160 a ./libs/three para jugar SIN conexión (opcional).
# Requiere Node/npm. Ejecutar desde la carpeta del proyecto:  bash tools/vendor-three.sh
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
( cd "$tmp" && npm init -y >/dev/null && npm install three@0.160.0 >/dev/null )
mkdir -p libs/three/build libs/three/examples
cp "$tmp/node_modules/three/build/three.module.js" libs/three/build/
cp -r "$tmp/node_modules/three/examples/jsm" libs/three/examples/
rm -rf "$tmp"
echo "Three.js copiado en libs/three. index.html lo usará automáticamente."
