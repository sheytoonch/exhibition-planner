const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};
vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.C=PlanConstraints;this.T=PlanTopology;',scope);
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
for(const viaAngle of [60,150,240])for(const [dx,dy] of [[20,0],[-20,0],[0,20],[0,-20],[0,400],[0,-400],[400,0],[-400,0]])for(const moving of ['line','arc']){
  const point=degrees=>({x:300+150*Math.cos(degrees*Math.PI/180),y:300+150*Math.sin(degrees*Math.PI/180)});
  const g=scope.T.normalize({lines:[{id:'line',a:point(0),b:{x:450,y:180}}],shapes:[{id:'arc',type:'arc',a:point(0),via:point(viaAngle),b:point(300)}],relations:[{id:'join',type:'collinear',objects:['arc','line'],keyA:'a',keyB:'a'}]});
  scope.T.connect(g,g.lines[0].a,g.shapes[0].a);
  const object=moving==='line'?g.lines[0]:g.shapes[0],keys=moving==='line'?['a','b']:['a','via','b'];
  const changes=keys.map(key=>({from:object[key],to:{x:object[key].x+dx,y:object[key].y+dy}}));
  const result=scope.C.solve(g.lines,changes,1,[],{shapes:g.shapes,relations:g.relations});
  assert.ok(result,`${moving} movement ${dx},${dy}, via ${viaAngle}`);
  const arc=result.shapes[0];
  near(arc.a.x,result[0].a.x);near(arc.a.y,result[0].a.y);
  if(moving==='line'){near(arc.b.x,g.shapes[0].b.x);near(arc.b.y,g.shapes[0].b.y);}
  else for(const key of keys){near(arc[key].x,object[key].x+dx);near(arc[key].y,object[key].y+dy);}
}
console.log('OK: major arcs and joined lines move in all four directions, independently of the middle point position.');
