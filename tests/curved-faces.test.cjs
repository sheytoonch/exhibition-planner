const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scope={structuredClone},source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');
vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.F=PlanFaces;this.E=PlanExtrusions;',scope);
const g=(lines=[],shapes=[])=>({planeId:'xy',lines,shapes}),circle=(id,x,y,radius)=>({id,type:'circle',center:{x,y},radius}),line=(id,ax,ay,bx,by)=>({id,a:{x:ax,y:ay},b:{x:bx,y:by}});
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('Unit: saved point-on-line relation closes the user arc profile within solver accuracy without changing the sketch',()=>{
  const geometry=require('./fixtures/point-on-arc-region.json'),before=JSON.stringify(geometry);
  const faces=scope.F.detect(geometry),curved=faces.filter(f=>f.outer.some(e=>e.curve.kind==='arc'));
  assert.equal(curved.length,1);near(curved[0].area,31225.07695911342);
  assert.equal(JSON.stringify(geometry),before);
  const open=structuredClone(geometry);open.relations=[];
  assert.equal(scope.F.detect(open).filter(f=>f.outer.some(e=>e.curve.kind==='arc')).length,0);
  const broken=structuredClone(geometry);broken.lines[9].a.y+=.01;
  assert.equal(scope.F.detect(broken).filter(f=>f.outer.some(e=>e.curve.kind==='arc')).length,0);
});
test('Unit: crossing segments create virtual vertices and a point-on extension cannot close a gap',()=>{
  const geometry=g([line('bottom',0,0,10,0),line('right',10,0,10,10),line('top',10,10,0,10),line('left',0,10,0,0),line('diagonal-a',0,0,10,10),line('diagonal-b',0,10,10,0)]);
  const faces=scope.F.detect(geometry);assert.equal(faces.length,4);faces.forEach(f=>near(f.area,25));
  const open=g([line('bottom',0,0,9,0),line('right',10,0,10,10),line('top',10,10,0,10),line('left',0,10,0,0)]);
  open.relations=[{type:'pointOn',objects:['right','bottom'],keyA:'a'}];assert.equal(scope.F.detect(open).length,0);
});
test('Unit: a circular surface has one analytic boundary edge and exact area, independent of display tessellation',()=>{
  for(const r of [1,10,1000]){const [face]=scope.F.detect(g([],[circle('circle',0,0,r)]));assert.equal(face.outer.length,1);assert.equal(face.outer[0].curve.kind,'arc');near(face.area,Math.PI*r*r);
    const coarse=scope.F.mesh(face,1),fine=scope.F.mesh(face,.001);assert.ok(fine.points.length>coarse.points.length);near(face.area,Math.PI*r*r);assert.equal(face.outer.length,1);
    assert.ok(scope.E.displayBoundary([face]).every(edge=>!edge.start&&!edge.end),'Display subdivisions do not create vertical model edges on a cylinder');}
});
test('Unit: a semicircle keeps its arc and chord; extrusion has one cylindrical side and one planar side',()=>{
  const arc={id:'arc',type:'arc',a:{x:-10,y:0},via:{x:0,y:-10},b:{x:10,y:0}},[face]=scope.F.detect(g([line('chord',-10,0,10,0)],[arc]));
  assert.equal(face.outer.length,2);near(face.area,50*Math.PI);const surfaces=scope.E.surfaces([face],1);assert.equal(surfaces.filter(s=>s.kind==='cylinder').length,1);assert.equal(surfaces.filter(s=>s.kind==='plane').length,3);
});
test('Unit: circle intersections, diameter, external tangency and duplicate circles preserve analytic regions',()=>{
  const a=circle('a',0,0,10),b=circle('b',10,0,10),faces=scope.F.detect(g([],[a,b]));assert.equal(faces.length,3);
  const overlap=200*Math.acos(.5)-50*Math.sqrt(3);near(faces.reduce((sum,f)=>sum+f.area,0),200*Math.PI-overlap);
  const halves=scope.F.detect(g([line('diameter',-10,0,10,0)],[a]));assert.equal(halves.length,2);halves.forEach(f=>near(f.area,50*Math.PI));
  assert.equal(scope.F.detect(g([],[a,circle('tangent',20,0,10)])).length,2);
  assert.equal(scope.F.detect(g([],[a,circle('duplicate',0,0,10)])).length,1);
});
test('Unit: Bézier boundaries remain curves, give exact areas and split at real intersections',()=>{
  const bezier={id:'bezier',type:'bezier',a:{x:0,y:0},via:{x:5,y:10},b:{x:10,y:0}},chord=line('chord',0,0,10,0);
  const [face]=scope.F.detect(g([chord],[bezier]));near(face.area,100/3);assert.equal(face.outer.length,2);assert.ok(face.outer.some(e=>e.curve.kind==='bezier'));
  const halves=scope.F.detect(g([chord,line('divider',5,0,5,10)],[bezier]));assert.equal(halves.length,2);halves.forEach(f=>near(f.area,50/3));
});
test('Unit: surface identifiers survive geometric edits that preserve boundary topology; older extrusion ids migrate',()=>{
  const geometry=g([],[circle('circle',10,20,10)]),[before]=scope.F.detect(geometry);geometry.shapes[0].center.x+=13;geometry.shapes[0].radius=20;
  assert.equal(scope.F.detect(geometry)[0].id,before.id);
  const legacy=scope.F.legacy(geometry);geometry.extrusions=[{id:'saved',faceIds:[legacy[0].id],height:1.5}];assert.ok(scope.F.migrate(geometry));assert.equal(geometry.extrusions[0].faceIds[0],scope.F.detect(geometry)[0].id);near(geometry.extrusions[0].height,1.5);
});
test('Unit: overlapping arc boundaries, nested tangent circles and tangent lines do not create false surfaces',()=>{
  const a=circle('circle',0,0,10),arc={id:'arc',type:'arc',a:{x:-10,y:0},via:{x:0,y:-10},b:{x:10,y:0}};
  const duplicate=scope.F.detect(g([],[a,arc]));assert.equal(duplicate.length,1);near(duplicate[0].area,100*Math.PI);
  const nested=scope.F.detect(g([],[a,circle('inside',5,0,5)]));assert.equal(nested.length,2);near(nested.reduce((sum,f)=>sum+f.area,0),100*Math.PI);
  const tangent=scope.F.detect(g([line('tangent',-20,-10,20,-10)],[a]));assert.equal(tangent.length,1);near(tangent[0].area,100*Math.PI);
});
test('Unit: Bézier/Bézier and Bézier/circle crossings are actual curve intersections',()=>{
  const up={id:'up',type:'bezier',a:{x:0,y:0},via:{x:5,y:10},b:{x:10,y:0}},down={id:'down',type:'bezier',a:{x:0,y:5},via:{x:5,y:-5},b:{x:10,y:5}};
  const faces=scope.F.detect(g([],[up,down]));assert.equal(faces.length,1);assert.ok(faces[0].outer.every(e=>e.curve.kind==='bezier'));assert.ok(faces[0].area>0);
  const mixed=scope.F.detect(g([line('base',0,0,10,0)],[up,circle('circle',5,0,3)]));assert.ok(mixed.length>=3);
});
