import fs from 'fs';
const [,, file, verbose] = process.argv;
const buf = fs.readFileSync(file);
const jl = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
// matrix helpers (column-major)
const I = () => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const mul = (a,b)=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
const TRS=(t=[0,0,0],q=[0,0,0,1],s=[1,1,1])=>{const [x,y,z,w]=q;const m=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,0,0,0,1];
 return [m[0]*s[0],m[1]*s[0],m[2]*s[0],0,m[4]*s[1],m[5]*s[1],m[6]*s[1],0,m[8]*s[2],m[9]*s[2],m[10]*s[2],0,t[0],t[1],t[2],1];};
const nodeM = n => n.matrix ? n.matrix : TRS(n.translation,n.rotation,n.scale);
const apply=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const nodes=json.nodes||[];
const parent={};
nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent[c]=i));
const world=i=>{let m=nodeM(nodes[i]);let p=parent[i];while(p!==undefined){m=mul(nodeM(nodes[p]),m);p=parent[p];}return m;};
const gmin=[1e9,1e9,1e9],gmax=[-1e9,-1e9,-1e9];
const per=[];
nodes.forEach((n,i)=>{
  if(n.mesh===undefined)return;
  const mesh=json.meshes[n.mesh];
  const W=world(i);
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  let tris=0;
  for(const p of mesh.primitives){
    const a=json.accessors[p.attributes.POSITION];
    if(p.indices!==undefined)tris+=json.accessors[p.indices].count/3;else tris+=a.count/3;
    for(let k=0;k<8;k++){
      const c=[k&1?a.max[0]:a.min[0],k&2?a.max[1]:a.min[1],k&4?a.max[2]:a.min[2]];
      const w=apply(W,c);for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],w[j]);mx[j]=Math.max(mx[j],w[j]);gmin[j]=Math.min(gmin[j],w[j]);gmax[j]=Math.max(gmax[j],w[j]);}
    }
  }
  per.push({i,name:n.name,mesh:mesh.name,skin:n.skin,tris,min:mn.map(v=>+v.toFixed(3)),max:mx.map(v=>+v.toFixed(3))});
});
console.log('FILE',file);
console.log('asset',JSON.stringify(json.asset));
console.log('extensionsUsed',json.extensionsUsed,'req',json.extensionsRequired);
console.log('scenes',json.scenes?.length,'nodes',nodes.length,'meshes',json.meshes?.length,'materials',json.materials?.length,'textures',json.textures?.length,'images',json.images?.length,'skins',json.skins?.length,'anims',json.animations?.length);
console.log('BBOX min',gmin.map(v=>+v.toFixed(3)),'max',gmax.map(v=>+v.toFixed(3)),'size',gmax.map((v,i)=>+(v-gmin[i]).toFixed(3)));
console.log('total tris',per.reduce((a,b)=>a+b.tris,0));
console.log('scene root nodes',json.scenes?.[json.scene||0]?.nodes?.map(i=>nodes[i].name+'#'+i));
if(json.skins)json.skins.forEach((s,i)=>console.log('skin',i,s.name,'joints',s.joints.length,s.joints.map(j=>nodes[j].name).join(',')));
if(json.animations)json.animations.forEach(a=>{
  let dur=0;a.samplers.forEach(s=>{const acc=json.accessors[s.input];dur=Math.max(dur,acc.max?.[0]||0);});
  console.log('anim',a.name,'channels',a.channels.length,'dur',dur.toFixed(2));
});
if(json.materials)json.materials.forEach((m,i)=>console.log('mat',i,m.name,JSON.stringify(m.pbrMetallicRoughness||{}),m.doubleSided?'DS':'',m.alphaMode||''));
console.log('--- mesh nodes');
per.forEach(p=>console.log(JSON.stringify(p)));
if(verbose){console.log('--- all nodes');nodes.forEach((n,i)=>{console.log(i,n.name,'parent',parent[i],'t',n.translation,'r',n.rotation,'s',n.scale,n.mesh!==undefined?'mesh':'' )});}
