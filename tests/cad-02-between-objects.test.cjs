const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const {session,launch,near} = require('./cad-test-helpers.cjs');
let browser;
before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});

test('Between objects / parallel line distance, endpoint origins and association after movement',()=>session(browser,async({draw,mode,click,read,page})=>{
  await draw('line',[[200,400],[500,400]]);
  await draw('line',[[250,600],[550,600]]);
  await mode('distance');await click(350,400);await click(400,600);
  const g=await read();assert.equal(g.dimensions.length,1);
  assert.deepEqual(g.dimensions[0].objects,g.lines.map(l=>l.id));
  const result=await page.evaluate(g=>{
    const d=g.dimensions[0],before=PlanDimensions.line(g,d);
    g.lines[1].a.y+=30;g.lines[1].b.y+=30;
    const moved=PlanDimensions.line(g,d);
    return {before,moved};
  },g);
  near(result.before.a.x,g.lines[0].a.x);near(result.before.originB.x,g.lines[1].a.x);
  near(Math.hypot(result.before.b.x-result.before.a.x,result.before.b.y-result.before.a.y),200);
  near(Math.hypot(result.moved.b.x-result.moved.a.x,result.moved.b.y-result.moved.a.y),230);
  assert.deepEqual((await read()).lines,g.lines,'Measurement does not move objects');
}));

for(const pair of ['line-line','line-arc','arc-arc'])test(`Between objects / coincident endpoints ${pair}`,()=>session(browser,async({draw,page,click,read})=>{
  if(pair==='arc-arc')await draw('three',[[200,500],[300,400],[400,500]]);
  else await draw('line',[[200,500],[400,500]]);
  if(pair==='line-line')await draw('line',[[600,500],[800,550]]);
  else await draw('three',[[600,500],[700,400],[800,500]]);
  await page.locator('[data-tool-menu=binding-method-menu]').click();await page.locator('[data-relation-type=coincident]').click();
  await click(400,500);await click(600,500);
  const g=await read(),objects=[...g.lines,...g.shapes];
  assert.equal(g.relations.length,1);assert.equal(g.relations[0].type,'coincident');
  const [a,b]=g.relations[0].objects.map(id=>objects.find(o=>o.id===id));
  const p=a[g.relations[0].keyA],q=b[g.relations[0].keyB];
  near(p.x,q.x);near(p.y,q.y);assert.equal(p.nodeId,q.nodeId);
}));

test('Arc / complete length along arc is different from straight endpoint distance',()=>session(browser,async({draw,mode,click,read,page})=>{
  await draw('three',[[200,500],[300,400],[400,500]]);
  await draw('line',[[600,500],[800,500]]);
  await mode('arcLength');await click(300,400);
  const g=await read();assert.equal(g.shapes[0].dimensionType,'arcLength');
  const value=await page.evaluate(s=>PlanDimensions.arcLength(s),g.shapes[0]);
  near(value,Math.PI*100);near(Math.hypot(g.shapes[0].b.x-g.shapes[0].a.x,g.shapes[0].b.y-g.shapes[0].a.y),200);
}));

// Point and partial-arc acceptance cases exercise actual UI and numeric results.
for(const [from,to] of [['a','via'],['via','b'],['a','b']])test(`Points / straight arc-point distance ${from} -> ${to}`,()=>session(browser,async({draw,mode,page,click,read})=>{
  const g=await draw('three',[[200,500],[300,400],[400,500]]);
  await draw('line',[[600,500],[800,500]]);
  await mode('pointDistance');
  for(const key of [from,to])await click(g.shapes[0][key].x,g.shapes[0][key].y);
  const result=await read(),dimension=result.dimensions.find(d=>d.type==='pointDistance');
  assert.ok(dimension);
  const measured=await page.evaluate(({result,dimension})=>PlanDimensions.line(result,dimension),{result,dimension});
  const a=g.shapes[0][from],b=g.shapes[0][to];near(Math.hypot(measured.b.x-measured.a.x,measured.b.y-measured.a.y),Math.hypot(b.x-a.x,b.y-a.y));
}));
for(const key of ['a','via','b'])test(`Points / line endpoint to arc ${key}`,()=>session(browser,async({draw,mode,click,read,page})=>{
  const g=await draw('three',[[200,500],[300,400],[400,500]]);
  await draw('line',[[600,500],[800,500]]);
  await mode('pointDistance');await click(600,500);await click(g.shapes[0][key].x,g.shapes[0][key].y);
  const result=await read(),dimension=result.dimensions.find(d=>d.type==='pointDistance');assert.ok(dimension);
  const measured=await page.evaluate(({result,dimension})=>PlanDimensions.line(result,dimension),{result,dimension});
  const p=g.shapes[0][key];near(Math.hypot(measured.b.x-measured.a.x,measured.b.y-measured.a.y),Math.hypot(p.x-600,p.y-500));
}));
for(const [from,to] of [['a','via'],['via','b']])test(`Points / partial arc length ${from} -> ${to}`,()=>session(browser,async({draw,mode,click,read,page})=>{
  const g=await draw('three',[[200,500],[300,400],[400,500]]);
  await draw('line',[[600,500],[800,500]]);
  await mode('partialArcLength');
  for(const key of [from,to])await click(g.shapes[0][key].x,g.shapes[0][key].y);
  const result=await read(),dimension=result.dimensions.find(d=>d.type==='partialArcLength');assert.ok(dimension);
  const length=await page.evaluate(({shape,from,to})=>PlanDimensions.arcLength(shape,from,to),{shape:result.shapes[0],from,to});
  near(length,Math.PI*50);
}));
