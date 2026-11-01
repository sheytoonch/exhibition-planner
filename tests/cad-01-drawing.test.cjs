const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {session, launch, near} = require('./cad-test-helpers.cjs');
let browser;
before(async()=>{browser=await launch();});
after(async()=>{await browser?.close();});
const cases = [
  ['line', [[200,400],[500,450]], g=>{assert.equal(g.lines.length,1);near(g.lines[0].b.x,500);near(g.lines[0].b.y,450);}],
  ['line', [[200,400],[500,450]], g=>{const l=g.lines[0];near(l.a.y,l.b.y);}, true, 'Shift'],
  ['polyline', [[200,400],[450,400],[450,600]], g=>{assert.equal(g.lines.length,2);assert.equal(g.lines[0].b.nodeId,g.lines[1].a.nodeId);assert.equal(g.lines[0].polylineId,g.lines[1].polylineId);}],
  ['polyline', [[200,400],[450,400],[450,600],[200,400]], g=>{assert.equal(g.lines.length,3);assert.equal(g.lines[2].b.nodeId,g.lines[0].a.nodeId);}, false, 'closed'],
  ['rectangle', [[200,400],[500,550]], g=>{assert.equal(g.lines.length,4);for(let i=0;i<4;i++)assert.equal(g.lines[i].b.nodeId,g.lines[(i+1)%4].a.nodeId);}],
  ['rectangle', [[200,400],[400,500]], g=>{assert.equal(g.lines.length,4);near(Math.hypot(g.lines[0].b.x-g.lines[0].a.x,g.lines[0].b.y-g.lines[0].a.y),Math.hypot(g.lines[1].b.x-g.lines[1].a.x,g.lines[1].b.y-g.lines[1].a.y));}, true, 'square'],
  ['circle', [[300,450],[400,450]], g=>{assert.equal(g.shapes.length,1);near(g.shapes[0].radius,100);near(g.shapes[0].center.x,300);}],
  ['three', [[200,500],[300,400],[400,500]], g=>{const s=g.shapes[0];assert.equal(s.type,'arc');near(s.a.x,200);near(s.via.y,400);near(s.b.x,400);}],
  ['ends', [[200,500],[400,500],[300,400]], g=>{const s=g.shapes[0];assert.equal(s.type,'arc');near(s.via.y,400);near(s.b.x,400);}],
  ['center', [[300,500],[200,500],[300,400]], g=>{const s=g.shapes[0];assert.equal(s.type,'arc');near(s.a.x,200);near(s.b.y,400);}],
  ['bezier', [[200,400],[500,450],[200,600]], g=>{const s=g.shapes[0];assert.equal(s.type,'bezier');near(s.a.y,400);near(s.b.x,500);near(s.via.y,600);}]
];
for(const [tool,points,check,shift,label] of cases) test(`Drawing / ${tool} ${label||''}`, ()=>session(browser,async({draw,page,read})=>{
  const geometry=await draw(tool,points,shift);check(geometry);
  const ids=[...geometry.lines,...geometry.shapes].map(o=>o.id);
  assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(Boolean));
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
  assert.deepEqual(await read(),geometry,'Drawing and point identities survive reload');
}));
