const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.L=PlanLayers;this.T=PlanTopology;this.S=PlanSnap;this.C=PlanConstraints;',scope);
test('Unit: legacy geometry gets a default layer; construction geometry snaps but never forms boundaries',()=>{
  const g={lines:[{id:'guide',construction:true,a:{x:100,y:100},b:{x:200,y:100}},{id:'wall',a:{x:200,y:100},b:{x:200,y:200}}],shapes:[]};scope.T.normalize(g);
  assert.equal(g.layers.length,1);assert.equal(g.activeLayerId,g.layers[0].id);assert.ok(g.lines.every(o=>o.layerId===g.layers[0].id));
  assert.deepEqual(Array.from(scope.L.boundaries(g),o=>o.id),['wall']);assert.ok(scope.S.candidates(g,{x:100,y:100}).some(c=>c.point.nodeId===g.lines[0].a.nodeId));
  g.layers[0].visible=false;assert.equal(scope.S.candidates(g,{x:100,y:100}).length,0);
});
test('Unit: locked layers pin their geometry without changing individual lock flags',()=>{
  const g=scope.T.normalize({lines:[{id:'a',a:{x:100,y:100},b:{x:200,y:100}}],shapes:[]});g.layers[0].locked=true;
  const before=JSON.stringify(g);assert.equal(scope.C.solve(g.lines,[{from:g.lines[0].a,to:{x:120,y:130}}],.01,[],{layers:g.layers}),null);assert.equal(JSON.stringify(g),before);assert.ok(!g.lines[0].locked);
  g.layers[0].locked=false;assert.ok(scope.C.solve(g.lines,[{from:g.lines[0].a,to:{x:120,y:130}}],.01,[],{layers:g.layers}));
});
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});
test('E2E: normal geometry snaps to construction endpoints; conversion preserves geometry and connections',()=>session(browser,async({page,draw,click,read})=>{
  await page.locator('#plan-construction').check();await draw('line',[[200,450],[400,450]]);await page.locator('#plan-construction').uncheck();await draw('line',[[402,451],[650,550]]);
  let g=await read();assert.equal(g.lines[0].b.nodeId,g.lines[1].a.nodeId);assert.equal(g.lines[0].construction,true);assert.ok(!g.lines[1].construction);near(g.lines[1].a.x,400);near(g.lines[1].a.y,450);
  await click(300,450);const before=await read();await page.locator('#plan-layers').click();await page.locator('#selection-construction').click();await page.keyboard.press('Escape');g=await read();assert.equal(g.lines[0].construction,false);assert.deepEqual(g.lines[0].a,before.lines[0].a);assert.deepEqual(g.lines[0].b,before.lines[0].b);assert.equal(g.lines[0].b.nodeId,g.lines[1].a.nodeId);
  await page.keyboard.press('Control+z');assert.equal((await read()).lines[0].construction,true);
}));
test('E2E: construction line and arc, default drawing, layer-click assignment, visibility, locking, undo and reload',()=>session(browser,async({page,draw,click,read})=>{
  page.setDefaultTimeout(5000);
  await page.locator('#plan-construction').check();await draw('line',[[200,400],[400,400]]);await draw('three',[[550,500],[650,400],[750,500]]);
  let g=await read();assert.equal(g.lines[0].construction,true);assert.equal(g.shapes[0].construction,true);
  await page.locator('#plan-construction').uncheck();await page.locator('#plan-layers').click();await page.locator('#layer-name').fill('Ściany');await page.locator('#layer-add').click();
  await page.keyboard.press('Escape');await draw('line',[[200,600],[400,600]]);g=await read();const layer=g.layers.find(l=>l.name==='Ściany');assert.ok(layer);assert.equal(g.lines[1].layerId,'default');assert.ok(!g.lines[1].construction);
  await click(300,600);await page.locator('#plan-layers').click();await page.locator('#layer-list').getByRole('button',{name:'Ściany',exact:true}).click();await page.keyboard.press('Escape');g=await read();assert.equal(g.lines[1].layerId,layer.id);
  assert.ok(await page.locator('#layers-menu').isHidden());await page.locator('#plan-layers').click();const row=page.locator(`#layer-list [data-layer-id="${layer.id}"]`);await row.getByRole('checkbox',{name:'Widoczna'}).uncheck();await page.keyboard.press('Escape');await click(300,600);assert.ok(await page.locator('#selection-more').isHidden());
  await page.locator('#plan-layers').click();await row.getByRole('checkbox',{name:'Widoczna'}).check();await row.getByRole('checkbox',{name:'Zablokowana'}).check();await page.keyboard.press('Escape');
  const box=await page.locator('#plan-surface').boundingBox();await page.mouse.move(box.x+box.width*.3,box.y+box.height*600/700);await page.mouse.down();await page.mouse.move(box.x+box.width*.35,box.y+box.height*550/700,{steps:5});await page.mouse.up();assert.deepEqual((await read()).lines,g.lines);
  await page.locator('#plan-layers').click();await row.getByRole('checkbox',{name:'Zablokowana'}).uncheck();await page.keyboard.press('Escape');await click(300,400);await page.locator('#plan-layers').click();await row.getByRole('button',{name:'Ściany',exact:true}).click();await page.keyboard.press('Escape');g=await read();assert.equal(g.lines[0].layerId,layer.id);assert.equal(g.lines[0].construction,true);
  await page.keyboard.press('Control+z');assert.notEqual((await read()).lines[0].layerId,layer.id);await page.keyboard.press('Control+y');g=await read();await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).layers,g.layers);assert.deepEqual((await read()).lines,g.lines);assert.deepEqual((await read()).shapes,g.shapes);
}));
