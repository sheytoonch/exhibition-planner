const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),scope={structuredClone},source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+';this.T=PlanTopology;this.E=PlanEditing;',scope);

test('Unit: line splitting projects the point, preserves endpoint references and respects locked layers',()=>{
 const g=scope.T.normalize({lines:[{id:'line',a:{x:0,y:0},b:{x:100,y:0}}]});g.dimensions=[{type:'pointDistance',objects:['line'],points:[{objectId:'line',key:'a'},{objectId:'line',key:'b'}]}];
 const [a,b]=scope.E.split(g,g.lines[0],{x:40,y:7});assert.equal(a.b.x,40);assert.equal(a.b.y,0);assert.equal(a.b.nodeId,b.a.nodeId);assert.equal(g.dimensions[0].points[0].objectId,a.id);assert.equal(g.dimensions[0].points[1].objectId,b.id);
 const before=JSON.stringify(g);assert.throws(()=>scope.E.split(g,a,a.a));assert.equal(JSON.stringify(g),before);
 g.layers.find(layer=>layer.id==='default').locked=true;assert.throws(()=>scope.E.split(g,a,{x:20,y:0}));assert.equal(g.lines.length,2);
});

test('E2E: double-click adds a shared point to a line, preserves endpoints and supports undo, redo and reload',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('line',[[200,400],[600,500]]);const before=await read();await page.locator('#plan-select').click();
  const r=await page.locator('#plan-surface').boundingBox();await page.mouse.dblclick(r.x+r.width*.4,r.y+r.height*450/700);
  const after=await read();assert.equal(after.lines.length,2);const [a,b]=after.lines;near(a.b.x,400);near(a.b.y,450);near(b.a.x,400);near(b.a.y,450);assert.equal(a.b.nodeId,b.a.nodeId);assert.deepEqual(a.a,before.lines[0].a);assert.deepEqual(b.b,before.lines[0].b);assert.notEqual(a.id,b.id);
  await page.mouse.move(r.x+r.width*.4,r.y+r.height*450/700);await page.mouse.down();await page.mouse.move(r.x+r.width*.4,r.y+r.height*500/700,{steps:6});await page.mouse.up();
  const moved=await read();near(moved.lines[0].b.y,500);near(moved.lines[1].a.y,500);assert.equal(moved.lines[0].b.nodeId,moved.lines[1].a.nodeId);await page.keyboard.press('Control+z');assert.deepEqual(await read(),after);
  await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);await page.keyboard.press('Control+y');assert.deepEqual(await read(),after);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual(await read(),after);
 });}finally{await browser.close();}
});
