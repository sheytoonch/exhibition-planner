const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scope={structuredClone},source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+';this.S=PlanSketchTools;this.R=PlanTrimming;',scope);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),p=(x,y)=>({x,y});
test('Unit: circle point methods preserve center, diameter and three-point geometry and reject collinearity',()=>{
 const S=scope.S;near(S.circle('radius',[p(0,0),p(3,4)]).radius,5);near(S.circle('diameter',[p(0,0)],10).radius,5);
 const two=S.circle('two',[p(0,0),p(10,0)]);near(two.center.x,5);near(two.radius,5);
 const three=S.circle('three',[p(0,5),p(5,0),p(10,5)]);near(three.center.x,5);near(three.center.y,5);near(three.radius,5);assert.equal(S.circle('three',[p(0,0),p(1,1),p(2,2)]),null);
});
test('Unit: numeric arcs preserve radius and signed angle; tangent arcs match the incoming direction',()=>{
 const S=scope.S,arc=S.radiusArc(p(0,0),p(10,0),10),data=scope.R.arc(arc.a,arc.via,arc.b);near(data.radius,10);assert.equal(S.radiusArc(p(0,0),p(10,0),4),null);
 const angle=S.centerArc(p(0,0),p(10,0),null,-Math.PI/2);near(angle.b.x,0);near(angle.b.y,-10);assert.equal(S.centerArc(p(0,0),p(10,0),null,2*Math.PI),null);
 const tangent=S.tangentArc(p(0,0),p(10,10),p(1,0)),circle=scope.R.arc(tangent.a,tangent.via,tangent.b);near(circle.cx,0);near(circle.cy,10);near(circle.radius,10);assert.equal(S.tangentArc(p(0,0),p(10,0),p(1,0)),null);
});
test('Unit: tangent circles satisfy every selected line including parallel pairs',()=>{
 const lines=[{a:p(0,0),b:p(10,0)},{a:p(0,10),b:p(10,10)}],S=scope.S,two=S.tangentCircle(lines,[p(4,0),p(6,10)],5);near(two.center.x,5);near(two.center.y,5);near(two.radius,5);assert.equal(S.tangentCircle(lines,[p(4,0),p(6,10)],3),null);
 const three=S.tangentCircle([...lines,{a:p(10,0),b:p(10,10)}],[p(5,0),p(5,10),p(10,5)]);near(three.radius,5);near(three.center.x,5);near(three.center.y,5);
});
