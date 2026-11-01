const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scope={structuredClone},source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.M=PlanMesh;this.L=PlanLighting;',scope);
const ring=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],area=t=>Math.abs((t[1].x-t[0].x)*(t[2].y-t[0].y)-(t[2].x-t[0].x)*(t[1].y-t[0].y))/2;
test('Unit: triangulation preserves concavity, holes and touching contours without filling holes',()=>{
  for(const [rings,expected]of [[[ring(0,0,10,10),ring(3,3,4,4)],84],[[[{x:0,y:0},{x:10,y:0},{x:10,y:5},{x:5,y:5},{x:5,y:10},{x:0,y:10}]],75],[[ring(0,0,10,10),ring(0,3,4,4)],84]]){
    const triangles=scope.M.triangulate(rings);assert.ok(Math.abs(triangles.reduce((sum,t)=>sum+area(t),0)-expected)<1e-8);
  }
});
test('Unit: ray picking tests depth, holes and both sides of zero-thickness faces',()=>{
  const cap=(id,rings,height,alpha=1)=>({rings:rings.map(r=>r.map(p=>({...p,height}))),ids:[id],color:'#88b6a0',alpha,edges:[],picks:[{faceId:id,rings:rings.map(r=>r.map(p=>({...p,height})))}]});
  const mesh=scope.M.build({faces:[{id:'top'},{id:'bottom'}],models:[cap('top',[ring(0,0,10,10),ring(3,3,4,4)],2),cap('bottom',[ring(0,0,10,10)],0,.35)],paths:[]});
  assert.equal(scope.M.raycast(mesh,[1,1,10],[0,0,-1],true),'top');assert.equal(scope.M.raycast(mesh,[5,5,10],[0,0,-1],true),'bottom');assert.equal(scope.M.raycast(mesh,[5,5,10],[0,0,-1],false),null);assert.equal(scope.M.raycast(mesh,[5,5,-10],[0,0,1],true),'bottom');
});

test('Unit: cap illumination is uniform and bottom normals face away from the light',()=>{
 const cap=(id,height,z)=>({color:'#ffffff',normal:{x:0,y:0,z},alpha:1,edges:[],picks:[{faceId:id,rings:[ring(0,0,10,10).map(p=>({...p,height}))]}]});
 const mesh=scope.M.build({faces:[{id:'top'},{id:'base'}],models:[cap('top',2,1),cap('base',0,-1)],paths:[],lighting:true});
 const lights=z=>Array.from({length:mesh.vertices.length/9},(_,i)=>i).filter(i=>mesh.vertices[i*9+2]===z).map(i=>mesh.irradiance[i]);
 assert.equal(new Set(lights(2)).size,1,'No vertex shadows are interpolated over large triangles');
 assert.ok(lights(2).every(v=>v>.5));assert.ok(lights(0).every(v=>v===0),'Bottom receives ambient light only');
 assert.equal(mesh.lighting.method,'shadow-map');
});
test('Unit: one fixed light projection follows rays and covers flat and large translated scenes',()=>{
 for(const bounds of [{min:[-8,-8,0],max:[8,8,2]},{min:[1e5,-2e5,0],max:[1e5+100,-2e5+100,0]}]){
  const m=scope.L.matrix(bounds),p=bounds.min.map((v,i)=>(v+bounds.max[i])/2),q=p.map((v,i)=>v+scope.L.direction[i]),project=p=>[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
  const a=project(p),b=project(q);assert.ok(Math.abs(a[0]-b[0])<1e-6);assert.ok(Math.abs(a[1]-b[1])<1e-6);assert.ok(b[2]<a[2],'Depth decreases toward the light');assert.ok([...m].every(Number.isFinite));
 }
});
test('Unit: opposing wall normals keep a consistent light direction regardless of contour order',()=>{
 const points=[{x:0,y:0,height:0},{x:0,y:10,height:0},{x:0,y:10,height:5},{x:0,y:0,height:5}];
 const build=(x,reverse)=>scope.M.build({faces:[{id:'wall'}],paths:[],lighting:true,models:[{normal:{x,y:0,z:0},side:true,color:'#ffffff',alpha:1,edges:[],picks:[{faceId:'wall',rings:[reverse?[...points].reverse():points]}]}]});
 const front=build(-1,false),reversed=build(-1,true),back=build(1,false);
 assert.ok([...front.irradiance].every(v=>v>.3));assert.deepEqual([...new Set(front.irradiance)],[...new Set(reversed.irradiance)]);assert.ok([...back.irradiance].every(v=>v===0));
});
test('Unit: studio fill separates wall angles in shadow and changes continuously around a curve',()=>{
 const x=scope.L.ambient([1,0,0]),y=scope.L.ambient([0,1,0]);assert.ok(Math.abs(x-y)>.15,'Back-facing perpendicular walls remain distinguishable');
 const values=Array.from({length:129},(_,i)=>scope.L.ambient([Math.cos(i*Math.PI/64),Math.sin(i*Math.PI/64),0]));
 assert.ok(Math.max(...values)-Math.min(...values)>.25,'Curved walls have pronounced directional modelling');
 for(let i=1;i<values.length;i++)assert.ok(Math.abs(values[i]-values[i-1])<.02,'Curve lighting changes smoothly without angle bands');
 assert.ok(values.every(v=>v>=.32&&v<=.68),'Fill preserves readable shadow detail');
});
