const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};
vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.C=PlanConstraints;',scope);
test('Unit: H/V endpoint drag stretches connected line without lateral drift',()=>{
  const p=(x,y,id)=>({x,y,nodeId:id});
  const lines=[{id:'h',a:p(200,400,'left'),b:p(500,400,'joint'),directionBinding:{mode:'horizontal'}},{id:'v',a:p(500,400,'joint'),b:p(500,600,'bottom'),directionBinding:{mode:'vertical'}}];
  for(const to of [{x:240,y:450},{x:170,y:350},{x:350,y:520}]){
    const result=scope.C.solve(lines,[{from:lines[0].a,to}],.01);assert.ok(result);near(result[0].a.x,to.x);near(result[0].a.y,to.y);
    near(result[0].b.x,500);near(result[0].b.y,to.y);near(result[1].a.x,500);near(result[1].a.y,to.y);near(result[1].b.x,500);near(result[1].b.y,600);
  }
});
test('Unit: zero-length transition is rejected without mutating the source and dragging can continue beyond it',()=>{
  const lines=[{id:'v',a:{x:500,y:400,nodeId:'joint'},b:{x:500,y:600,nodeId:'bottom'},directionBinding:{mode:'vertical'}},{id:'h',a:{x:200,y:400,nodeId:'left'},b:{x:500,y:400,nodeId:'joint'},directionBinding:{mode:'horizontal'}}],before=structuredClone(lines);
  assert.equal(scope.C.solve(lines,[{from:lines[0].b,to:{x:500,y:400}}],.01),null);assert.deepEqual(lines,before);
  const result=scope.C.solve(lines,[{from:lines[0].b,to:{x:500,y:300}}],.01);assert.ok(result);near(result[0].b.y,300);near(result[0].a.y,400);near(result[1].a.y,400);assert.deepEqual(lines,before);
});
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});
test('E2E: moving a vertical endpoint through the joint does not report a transient constraint conflict',()=>session(browser,async({draw,page,click,read})=>{
  await draw('line',[[500,400],[500,600]]);await draw('line',[[200,400],[500,400]]);
  for(const [mode,point] of [['vertical',[500,500]],['horizontal',[350,400]]]){await page.locator('[data-tool-menu=binding-method-menu]').click();await page.locator(`[data-binding-method=${mode}]`).click();await click(...point);}
  await page.locator('#plan-select').click();await click(500,500);const initial=await read();
  const box=await page.locator('#plan-surface').boundingBox(),screen=p=>({x:box.x+box.width*p.x/1000,y:box.y+box.height*p.y/700}),a=screen(initial.lines[0].b),b=screen({x:500,y:300});
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:30});await page.mouse.up();
  const g=await read();near(g.lines[0].b.x,500);near(g.lines[0].b.y,300);assert.deepEqual(g.lines[0].a,initial.lines[0].a);assert.deepEqual(g.lines[1],initial.lines[1]);
  assert.equal(await page.locator('#notifications .notification').filter({hasText:/Nie można|koliduje/}).count(),0);
}));
test('E2E: dragging the shared H/V corner moves only coordinates required by its bindings',()=>session(browser,async({draw,page,click,read})=>{
  await draw('line',[[500,400],[500,600]]);await draw('line',[[200,400],[500,400]]);
  for(const [mode,point] of [['vertical',[500,500]],['horizontal',[350,400]]]){await page.locator('[data-tool-menu=binding-method-menu]').click();await page.locator(`[data-binding-method=${mode}]`).click();await click(...point);}
  await page.locator('#plan-select').click();await click(500,500);
  for(const to of [{x:550,y:450},{x:450,y:350}]){
    const initial=await read(),box=await page.locator('#plan-surface').boundingBox(),screen=p=>({x:box.x+box.width*p.x/1000,y:box.y+box.height*p.y/700}),a=screen(initial.lines[0].a),b=screen(to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:20});await page.mouse.up();
    const g=await read();near(g.lines[0].a.x,to.x);near(g.lines[0].a.y,to.y);near(g.lines[0].b.x,to.x);near(g.lines[0].b.y,600);near(g.lines[1].a.x,200);near(g.lines[1].a.y,to.y);assert.deepEqual(g.lines[0].a,g.lines[1].b);
  }
  assert.equal(await page.locator('#notifications .notification').filter({hasText:/Nie można|koliduje/}).count(),0);
}));
test('E2E: dragging the free horizontal endpoint preserves vertical location and far endpoint',()=>session(browser,async({draw,page,click,read})=>{
  await draw('line',[[200,400],[500,400]]);await draw('line',[[500,400],[500,600]]);
  for(const [mode,point] of [['horizontal',[350,400]],['vertical',[500,500]]]){await page.locator('[data-tool-menu=binding-method-menu]').click();await page.locator(`[data-binding-method=${mode}]`).click();await click(...point);}
  await page.locator('#plan-select').click();await click(350,400);
  const original=await read();assert.equal(original.lines[0].b.nodeId,original.lines[1].a.nodeId);
  for(const to of [{x:240,y:450},{x:170,y:350},{x:350,y:520}]){
    const before=await read(),from=before.lines[0].a,box=await page.locator('#plan-surface').boundingBox(),screen=p=>({x:box.x+box.width*p.x/1000,y:box.y+box.height*p.y/700}),a=screen(from),b=screen(to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();
    const g=await read();near(g.lines[0].a.x,to.x);near(g.lines[0].a.y,to.y);near(g.lines[0].b.x,500);near(g.lines[0].b.y,to.y);near(g.lines[1].a.x,500);near(g.lines[1].a.y,to.y);assert.deepEqual(g.lines[1].b,original.lines[1].b);
    assert.equal(g.lines[0].directionBinding.mode,'horizontal');assert.equal(g.lines[1].directionBinding.mode,'vertical');assert.ok(!g.lines[0].fixedLength&&!g.lines[1].fixedLength);
  }
  const g=await read();await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).lines,g.lines);
}));
