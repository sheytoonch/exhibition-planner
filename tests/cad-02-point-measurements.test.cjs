const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');

let registeredCase=0;
const shardIndex=Number(process.env.CAD_SHARD_INDEX||0),shardCount=Number(process.env.CAD_SHARD_COUNT||1);
function register(name,run){const index=registeredCase++;if(index%shardCount===shardIndex)test(name,run);}

let browser;
before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});

// Independent mathematical fixtures. Points are in plan units, not image pixels.
const fixtures={
  line:{tool:'line',input:[[0,0],[120,60]],points:[[0,0],[120,60]]},
  polyline:{tool:'polyline',input:[[0,0],[120,0],[120,100]],points:[[0,0],[120,0],[120,100]]},
  rectangle:{tool:'rectangle',input:[[0,0],[120,100]],points:[[0,0],[120,0],[120,100],[0,100]]},
  circle:{tool:'circle',input:[[60,50],[110,50]],points:[[60,50],[110,50],[60,0],[10,50],[60,100]]},
  arc:{tool:'three',input:[[0,60],[60,0],[120,60]],points:[[0,60],[60,0],[120,60]]},
  arcEnds:{tool:'ends',input:[[0,60],[120,60],[60,0]],points:[[0,60],[60,0],[120,60]]},
  arcCenter:{tool:'center',input:[[60,60],[0,60],[120,60]],points:[[0,60],[60,120],[120,60]]},
  bezier:{tool:'bezier',input:[[0,0],[120,60],[0,100]],points:[[0,0],[120,60],[0,100]]}
};
const translate=(points,x,y)=>points.map(([px,py])=>[px+x,py+y]);
const types=Object.keys(fixtures);
const modes=[['pointDistance','aligned'],['pointHorizontal','horizontal'],['pointVertical','vertical']];

// 36 unordered pairs (including two separate objects of the same type) x 3 measurements.
// Within each test, every reference point of object A is paired with every point of B.
for(let i=0;i<types.length;i++)for(let j=i;j<types.length;j++)for(const [mode,projection]of modes){
  const first=types[i],second=types[j],a=fixtures[first],b=fixtures[second];
  register(`Point measurements between objects / ${first} + ${second} / ${projection} / ${a.points.length*b.points.length} point pairs`,
    ()=>session(browser,async({draw,page,click,mode:choose,read})=>{
      await draw(a.tool,translate(a.input,180,400));
      await draw(b.tool,translate(b.input,600,500));
      const initial=await read();
      // One real UI selection per case. The tool supports consecutive
      // measurements; reopening its menu for every pair dominated runtime.
      await choose(mode);
      let expectedDimensions=initial.dimensions.length;
      for(const from of translate(a.points,180,400))for(const to of translate(b.points,600,500)){
        await click(...from);await click(...to);
        const g=await read(),dimension=g.dimensions.at(-1);
        assert.ok(dimension,`No dimension for ${from} -> ${to}`);
        assert.equal(g.dimensions.length,++expectedDimensions,'Each point pair creates a new measurement without reselecting the tool');
        assert.equal(dimension.type,mode,'Consecutive measurements retain the selected mode');
        const value=await page.evaluate(({g,dimension})=>{
          const line=PlanDimensions.line(g,dimension);
          return line?Math.hypot(line.b.x-line.a.x,line.b.y-line.a.y):null;
        },{g,dimension});
        const dx=to[0]-from[0],dy=to[1]-from[1];
        near(value,projection==='horizontal'?Math.abs(dx):projection==='vertical'?Math.abs(dy):Math.hypot(dx,dy));
        assert.deepEqual(g.lines,initial.lines,'Measuring must not deform either object');
        assert.deepEqual(g.shapes,initial.shapes,'Measuring must not deform either object');
      }
    }));
}

// All three circular-arc construction methods must yield identical measurements.
for(const method of ['three','ends','center'])for(const measurement of ['radius','diameter','arcLength']){
  register(`Arc variants / ${method} / ${measurement} / numeric rendered value`,()=>session(browser,async({draw,mode,click,read,page})=>{
    const points=method==='three'?[[200,500],[300,400],[400,500]]:
      method==='ends'?[[200,500],[400,500],[300,400]]:[[300,500],[200,500],[400,500]];
    await draw(method,points);await draw('line',[[650,500],[800,550]]);
    await page.evaluate(()=>{
      window.measurementTexts=[];const original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.measurementTexts.push(String(text));return original.call(this,text,...args);};
    });
    await mode(measurement);
    const g=await read(),s=g.shapes[0];
    // Both semicircle orientations are legal for center-and-ends construction.
    await click(s.via.x,s.via.y);
    const result=await read();assert.equal(result.shapes[0].dimensionType,measurement);
    const expected=measurement==='radius'?'R 100':measurement==='diameter'?'Ø 200':'⌒ 314,2';
    assert.ok(await page.evaluate(text=>window.measurementTexts.includes(text),expected),`Missing rendered value ${expected}`);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
    assert.equal((await read()).shapes[0].dimensionType,measurement);
  }));
}
