const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});

for(const [dx,dy] of [[40,0],[-40,0],[0,-100],[0,300]])test(`Connected arc: actual line drag ${dx},${dy}, fixed far endpoint and tangent`,()=>session(browser,async({page,draw,click,read})=>{
  await draw('three',[[450,250],[270,320],[430,500]]);
  await draw('line',[[450,250],[650,300]]);
  await page.locator('[data-tool-menu=binding-method-menu]').click();await page.locator('[data-relation-type=collinear]').click();
  await click(270,320);await click(550,275);
  let g=await read();assert.equal(g.relations.length,1);const relation=g.relations[0],side=relation.objects.indexOf(g.shapes[0].id),jointKey=side===0?relation.keyA:relation.keyB,remoteKey=jointKey==='a'?'b':'a',remote={...g.shapes[0][remoteKey]};
  await page.locator('#plan-select').click();
  const start={x:(g.lines[0].a.x+g.lines[0].b.x)/2,y:(g.lines[0].a.y+g.lines[0].b.y)/2};await click(start.x,start.y);
  const box=await page.locator('#plan-surface').boundingBox(),screen=p=>({x:box.x+box.width*p.x/1000,y:box.y+box.height*p.y/700}),a=screen(start),b=screen({x:start.x+dx,y:start.y+dy});
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:20});await page.mouse.up();
  const moved=await read(),line=moved.lines[0],arc=moved.shapes[0];near(line.a.x,g.lines[0].a.x+dx);near(line.a.y,g.lines[0].a.y+dy);near(arc[remoteKey].x,remote.x);near(arc[remoteKey].y,remote.y);
  const lineKey=side===0?relation.keyB:relation.keyA;near(arc[jointKey].x,line[lineKey].x);near(arc[jointKey].y,line[lineKey].y);
  const u={x:arc.via.x-arc.a.x,y:arc.via.y-arc.a.y},v={x:arc.b.x-arc.a.x,y:arc.b.y-arc.a.y},d=2*(u.x*v.y-u.y*v.x),u2=u.x*u.x+u.y*u.y,v2=v.x*v.x+v.y*v.y,c={x:arc.a.x+(v.y*u2-u.y*v2)/d,y:arc.a.y+(u.x*v2-v.x*u2)/d},r={x:arc[jointKey].x-c.x,y:arc[jointKey].y-c.y},l={x:line.b.x-line.a.x,y:line.b.y-line.a.y};
  near((r.x*l.x+r.y*l.y)/(Math.hypot(r.x,r.y)*Math.hypot(l.x,l.y)),0);
  assert.equal(moved.relations.length,1);assert.equal(await page.locator('#notifications .notification').filter({hasText:/Nie można|koliduje/}).count(),0);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).lines,moved.lines);assert.deepEqual((await read()).shapes,moved.shapes);
}));
