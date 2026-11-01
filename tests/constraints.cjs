const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.constraints=PlanConstraints;',scope);
const {solve}=scope.constraints,point=(x,y)=>({x,y}),line=(id,a,b,extra={})=>({id,a,b,...extra}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-3,`${a} != ${b}`),length=line=>Math.hypot(line.a.x-line.b.x,line.a.y-line.b.y);
let lines=[line('a',point(0,0),point(100,0),{fixedLength:2}),line('b',point(100,0),point(100,100))];
let result=solve(lines,[{from:point(100,0),to:point(200,0)}],.01,[point(0,0)]);assert.ok(result);near(result[1].a.x,200);near(result[1].b.x,100);assert.ok(length(result[1])>140);
lines[1].fixedLength=1;result=solve(lines,[{from:point(100,0),to:point(200,0)}],.01,[point(0,0)]);assert.ok(result);near(length(result[1]),100);
lines[1].fixedAngle={degrees:90,referenceId:'a',anchorKey:'a',referenceAnchorKey:'b'};result=solve(lines,[{from:point(100,0),to:point(200,0)}],.01,[point(0,0)]);assert.ok(result);near(result[1].b.x,200);near(result[1].b.y,100);
lines[1].locked=true;assert.equal(solve(lines,[{from:point(100,0),to:point(200,0)}],.01,[point(0,0)]),null);
lines=[line('a',point(0,0),point(100,0),{fixedLength:1,fixedAngle:{degrees:0,referenceId:null,anchorKey:'a'}})];result=solve(lines,[{from:point(100,0),to:point(200,0)}],.01);assert.ok(result);near(result[0].a.x,100);near(length(result[0]),100);
assert.equal(solve(lines,[{from:point(100,0),to:point(200,0)}],.01,[point(0,0)]),null);
for(const [mode,degrees,a,b,target] of [['horizontal',0,point(0,0),point(100,0),point(150,50)],['vertical',90,point(0,0),point(0,100),point(50,150)],['angle',30,point(0,0),point(100,-100/Math.sqrt(3)),point(150,50)]]){
 const source=[line('direction',a,b,{directionBinding:{mode,degrees}})];const result=solve(source,[{from:b,to:target}],.01);assert.ok(result);const delta=result[0];if(mode==='horizontal')near(delta.a.y,delta.b.y);else if(mode==='vertical')near(delta.a.x,delta.b.x);else near((delta.b.y-delta.a.y)/(delta.b.x-delta.a.x),-Math.tan(Math.PI/6));
}
console.log('OK: free lengths stretch, fixed lengths propagate, relative angles hold, locks reject conflicts, endpoint dragging preserves fixed dimensions.');
lines=[line('a',point(0,0),point(100,0)),line('b',point(100,0),point(100,100)),line('c',point(100,100),point(200,100)),line('d',point(300,300),point(400,300))];
const changes=[{from:point(0,0),to:point(50,30)},{from:point(100,0),to:point(150,30)}];
result=solve(lines,changes,.01,[],{moveConnected:true});assert.ok(result);near(result[2].b.x,250);near(result[2].b.y,130);near(result[3].a.x,300);
lines[2].locked=true;result=solve(lines,changes,.01,[],{moveConnected:true});assert.ok(result);near(result[1].a.x,150);near(result[1].b.x,100);near(result[2].b.x,200);
lines=[line('a',point(0,0),point(100,0)),line('b',point(300,300),point(400,300),{fixedAngle:{degrees:0,referenceId:'a',anchorKey:'a',referenceAnchorKey:'a'}})];
result=solve(lines,changes,.01,[],{moveConnected:true});assert.ok(result);near(result[1].a.x,350);near(result[1].a.y,330);
console.log('OK: whole connected chains and angle-related lines follow dragging; unrelated and locked geometry stays.');
