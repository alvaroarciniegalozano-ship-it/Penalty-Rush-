// Mock mínimo de Three.js SOLO para pruebas de lógica en Node (no renderiza).
export const REVISION = 'mock';
export const SRGBColorSpace = 'srgb';
export const DoubleSide = 2;
export class Vector2 { constructor(x=0,y=0){this.x=x;this.y=y;} set(x,y){this.x=x;this.y=y;return this;} }
export class Vector3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  setScalar(s){this.x=s;this.y=s;this.z=s;return this;}
  fromArray(a){this.x=a[0];this.y=a[1];this.z=a[2];return this;}
  toArray(){return [this.x,this.y,this.z];}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  applyEuler(){return this;} applyQuaternion(){return this;} applyAxisAngle(){return this;}
  normalize(){const l=Math.hypot(this.x,this.y,this.z)||1;this.x/=l;this.y/=l;this.z/=l;return this;}
  project(cam){ // proyección pinhole simple
    const dx=this.x-cam.position.x, dy=this.y-cam.position.y, dz=this.z-cam.position.z;
    const f=1/Math.tan(cam.fov*Math.PI/360);
    return new Vector3(dx*f/(-dz)/cam.aspect, dy*f/(-dz), 0);
  }
}
export class Euler { constructor(x=0,y=0,z=0,o='XYZ'){this.x=x;this.y=y;this.z=z;this.order=o;} set(x,y,z,o){this.x=x;this.y=y;this.z=z;if(o)this.order=o;return this;} }
export class Quaternion { setFromEuler(){return this;} setFromAxisAngle(){return this;} premultiply(){return this;} identity(){return this;} }
class Box3 { constructor(){this.min=new Vector3();this.max=new Vector3();}
  setFromObject(o){const b=o.userBox||{min:[-1,0,-1],max:[1,2,1]};this.min.fromArray(b.min);this.max.fromArray(b.max);return this;}
  getSize(t){return t.set(this.max.x-this.min.x,this.max.y-this.min.y,this.max.z-this.min.z);}
  getCenter(t){return t.set((this.max.x+this.min.x)/2,(this.max.y+this.min.y)/2,(this.max.z+this.min.z)/2);} }
export { Box3 };
export class Color { constructor(c){this.c=c;} clone(){return new Color(this.c);} set(c){this.c=c;return this;} copy(c){this.c=c.c;return this;} }
let uid=0;
export class Object3D {
  constructor(){this.name='';this.userData={};this.parent=null;this.children=[];this.visible=true;
    this.position=new Vector3();this.scale=new Vector3(1,1,1);this.rotation=new Euler();this.quaternion=new Quaternion();
    this.matrixWorld={};this.uuid='u'+(uid++);}
  add(o){if(o.parent)o.parent.remove(o);o.parent=this;this.children.push(o);return this;}
  remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1);o.parent=null;return this;}
  removeFromParent(){if(this.parent)this.parent.remove(this);return this;}
  attach(o){this.add(o);return this;}
  traverse(fn){fn(this);for(const c of [...this.children])c.traverse(fn);}
  updateMatrixWorld(){} updateWorldMatrix(){}
  getWorldPosition(v){return v.set(this.position.x,this.position.y,this.position.z-28);}
  worldToLocal(v){return v;}
}
export class Group extends Object3D {}
export class Scene extends Object3D {}
export class Mesh extends Object3D { constructor(g,m){super();this.geometry=g;this.material=m;this.isMesh=true;} }
export class PerspectiveCamera extends Object3D { constructor(f,a,n,fa){super();this.fov=f;this.aspect=a;this.near=n;this.far=fa;} updateProjectionMatrix(){} }
export class WebGLRenderer { constructor(){this.calls=0;} setPixelRatio(){} setSize(){} render(){this.calls++;} }
export class Raycaster { constructor(){this.ray={origin:new Vector3(),direction:new Vector3()};}
  setFromCamera(v,cam){this.ray.origin.copy(cam.position);
    // dirección aproximada con yaw/pitch de la cámara
    const f=Math.tan(cam.fov*Math.PI/360);
    const d=new Vector3(v.x*f*cam.aspect,v.y*f,-1);
    const p=cam.rotation.x,y=cam.rotation.y;
    // rotación pitch (x) luego yaw (y)
    let dy=d.y*Math.cos(p)-d.z*Math.sin(p), dz=d.y*Math.sin(p)+d.z*Math.cos(p); d.y=dy; d.z=dz;
    let dx=d.x*Math.cos(y)+d.z*Math.sin(y); dz=-d.x*Math.sin(y)+d.z*Math.cos(y); d.x=dx; d.z=dz;
    this.ray.direction.copy(d).normalize();} }
class Mat { constructor(o={}){Object.assign(this,o);this.uuid='m'+(uid++);this.color=o.color instanceof Color?o.color:new Color(o.color);} }
export class MeshLambertMaterial extends Mat {}
export class MeshBasicMaterial extends Mat {}
class Geo { constructor(){this.attributes={position:{count:9}};this.index=null;} }
export class PlaneGeometry extends Geo {} export class CircleGeometry extends Geo {} export class IcosahedronGeometry extends Geo {}
class Light extends Object3D { constructor(a,b,c){super();this.args=[a,b,c];} }
export class HemisphereLight extends Light {} export class AmbientLight extends Light {} export class DirectionalLight extends Light { constructor(...a){super(...a);this.target=new Object3D();} }
export class CanvasTexture { constructor(){} }
export const PropertyBinding = { sanitizeNodeName: (n) => n.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '') };
