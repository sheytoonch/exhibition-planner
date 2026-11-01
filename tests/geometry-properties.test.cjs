const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.E=PlanExhibition;',scope);
test('Unit: generated wall partitions preserve union area, world coordinates, seams and input data',()=>{
  let seed=74231;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<60;i++){const width=100+random()*500,height=100+random()*300,cut=width*(.2+.6*random()),cm=.5+random()*2,make=(id,x,w)=>({id,origin:{x:x/cm,y:0,height:0},u:{x:1,y:0,height:0},v:{x:0,y:0,height:1},normal:{x:0,y:-1,height:0},cm,widthCm:w,heightCm:height,rings:[[{x:0,y:0},{x:w,y:0},{x:w,y:height},{x:0,y:height}]]}),parts=[make('a',0,cut),make('b',cut,width-cut)],before=JSON.stringify(parts),wall=scope.E.combine(parts,'joined');
    assert.ok(wall,`seed ${seed}`);assert.ok(Math.abs(wall.widthCm-width)<1e-5);assert.ok(Math.abs(wall.heightCm-height)<1e-5);const p={x:random()*width,y:random()*height},roundtrip=scope.E.local(wall,scope.E.world(wall,p.x,p.y,3));assert.ok(Math.abs(roundtrip.x-p.x)<1e-6&&Math.abs(roundtrip.y-p.y)<1e-6);assert.ok(scope.E.fits(wall,{x:cut-width*.05,y:height*.2,widthCm:width*.1,heightCm:height*.3}));assert.equal(JSON.stringify(parts),before);
  }
});
