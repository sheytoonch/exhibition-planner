const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch}=require('./cad-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.L=PlanLayers;this.T=PlanTopology;',scope);
test('Unit: previous active layer is reset to default without moving existing objects',()=>{
  const g=scope.T.normalize({layers:[{id:'extra',name:'Existing',visible:true,locked:false}],activeLayerId:'extra',lines:[{id:'a',layerId:'extra',a:{x:0,y:0},b:{x:100,y:0}}]});
  assert.equal(g.activeLayerId,'default');assert.equal(g.layers.find(layer=>layer.id==='default').name,'default');assert.equal(g.lines[0].layerId,'extra');assert.equal(g.layers.length,2);
});
for(const mode of ['move','delete'])test(`Unit: removing a layer with mode ${mode} handles its objects and dependencies`,()=>{
  const g=scope.T.normalize({layers:[{id:'default',name:'default'},{id:'extra',name:'Extra'}],lines:[{id:'a',layerId:'extra',a:{x:0,y:0},b:{x:100,y:0}},{id:'b',layerId:'default',a:{x:100,y:0},b:{x:100,y:100}}],shapes:[{id:'arc',type:'arc',layerId:'extra',a:{x:0,y:0},via:{x:50,y:-50},b:{x:100,y:0}}],surfaces:[{id:'surface',layerId:'extra'}],relations:[{id:'r',type:'perpendicular',objects:['a','b']}],dimensions:[{id:'d',type:'distance',objects:['a','b']}]});
  scope.L.remove(g,'extra',mode);assert.equal(g.layers.length,1);
  if(mode==='move'){assert.equal(g.lines.length,2);assert.equal(g.shapes.length,1);assert.equal(g.surfaces.length,1);assert.ok([...g.lines,...g.shapes,...g.surfaces].every(o=>o.layerId==='default'));assert.equal(g.relations.length,1);assert.equal(g.dimensions.length,1);}
  else{assert.equal(g.lines.length,1);assert.equal(g.lines[0].id,'b');assert.equal(g.shapes.length,0);assert.equal(g.surfaces.length,0);assert.equal(g.relations.length,0);assert.equal(g.dimensions.length,0);}
  assert.throws(()=>scope.L.remove(g,'default','delete'));assert.equal(g.layers.length,1);
});
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});
for(const mode of ['move','delete'])test(`E2E: draw on default, move a multi-selection by layer click, confirm removal ${mode}, undo and reload`,()=>session(browser,async({page,draw,click,read})=>{
  page.setDefaultTimeout(5000);
  await page.locator('#plan-layers').click();await page.locator('#layer-name').fill('Extra');await page.locator('#layer-add').click();await page.keyboard.press('Escape');
  await draw('line',[[200,400],[400,400]]);await draw('line',[[550,500],[750,500]]);let g=await read();assert.ok(g.lines.every(line=>line.layerId==='default'));
  await click(300,400);await click(650,500,['Shift']);await page.locator('#plan-layers').click();await page.locator('#layer-list').getByRole('button',{name:'Extra',exact:true}).click();g=await read();const extra=g.layers.find(l=>l.name==='Extra');assert.ok(g.lines.every(line=>line.layerId===extra.id));
  await page.keyboard.press('Escape');await draw('line',[[250,600],[450,600]]);g=await read();assert.equal(g.lines[2].layerId,'default');const before=structuredClone(g);
  await page.locator('#plan-layers').click();assert.equal(await page.locator('#layer-list [data-layer-id="default"] [data-layer-delete]').count(),0);await page.locator(`[data-layer-id="${extra.id}"] [data-layer-delete]`).click();
  assert.ok(await page.locator('#layer-delete-dialog').isVisible());await page.locator('#layer-delete-cancel').click();assert.deepEqual((await read()).lines,before.lines);assert.deepEqual((await read()).layers,before.layers);
  await page.locator('#plan-layers').click();await page.locator(`[data-layer-id="${extra.id}"] [data-layer-delete]`).click();await page.locator(mode==='move'?'#layer-delete-move':'#layer-delete-content').click();
  const after=await read();assert.equal(after.layers.length,1);assert.equal(after.lines.length,mode==='move'?3:1);assert.ok(after.lines.every(line=>line.layerId==='default'));if(mode==='move')for(let i=0;i<3;i++){assert.deepEqual(after.lines[i].a,before.lines[i].a);assert.deepEqual(after.lines[i].b,before.lines[i].b);}
  await page.keyboard.press('Control+z');assert.deepEqual((await read()).lines,before.lines);assert.deepEqual((await read()).layers,before.layers);await page.keyboard.press('Control+y');assert.deepEqual((await read()).lines,after.lines);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).layers,after.layers);assert.deepEqual((await read()).lines,after.lines);
}));
