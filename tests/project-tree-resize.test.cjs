const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {launch,session}=require('./cad-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.S=typeof ProjectTreeSize==="undefined"?null:ProjectTreeSize;',scope);
async function drag(page,x){const handle=await page.locator('#project-tree-resize').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+80);await page.mouse.down();await page.mouse.move(x,handle.y+80,{steps:8});await page.mouse.up();}
test('E2E: dragging the project tree edge resizes both panel and library, clamps its bounds and remembers the width',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.locator('#library-view-button').click();assert.equal(await page.locator('#project-tree-resize').count(),1);const before=await page.locator('#project-tree').boundingBox(),libraryBefore=await page.locator('#library-view').boundingBox();
  await drag(page,before.width+120);const after=await page.locator('#project-tree').boundingBox(),libraryAfter=await page.locator('#library-view').boundingBox();assert.ok(Math.abs(after.width-before.width-120)<1);assert.ok(Math.abs(libraryAfter.x-libraryBefore.x-120)<1);
  assert.equal(await page.locator('#project-tree-resize').getAttribute('aria-valuenow'),String(after.width));await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);assert.equal((await page.locator('#project-tree').boundingBox()).width,after.width);
  await drag(page,5);assert.equal((await page.locator('#project-tree').boundingBox()).width,200);await drag(page,1200);assert.equal((await page.locator('#project-tree').boundingBox()).width,600);assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('project-tree-resizing')),false);
 });}finally{await browser.close();}
});

test('Unit: tree width respects desktop and narrow-screen limits',()=>{
 for(const [viewport,min,max]of [[1500,200,600],[701,200,341],[390,200,358],[200,168,168]])assert.deepEqual(JSON.parse(JSON.stringify(scope.S.bounds(viewport))),{min,max});
});
test('Unit: tree width clamps, rounds and falls back for invalid sizes',()=>{
 assert.equal(scope.S.clamp(10,1500),200);assert.equal(scope.S.clamp(999,1500),600);assert.equal(scope.S.clamp(230.6,1500),231);assert.equal(scope.S.clamp(NaN,1500),232);assert.equal(scope.S.clamp(600,390),358);
});
test('E2E: resize supports keyboard control and Escape cancels an unfinished drag',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.locator('#library-view-button').click();const before=(await page.locator('#project-tree').boundingBox()).width,handle=await page.locator('#project-tree-resize').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+60);await page.mouse.down();await page.mouse.move(before+100,handle.y+60,{steps:5});assert.ok((await page.locator('#project-tree').boundingBox()).width>before);await page.keyboard.press('Escape');assert.equal((await page.locator('#project-tree').boundingBox()).width,before);await page.mouse.up();assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('project-tree-resizing')),false);
  await page.locator('#project-tree-resize').focus();await page.keyboard.press('ArrowRight');assert.equal((await page.locator('#project-tree').boundingBox()).width,before+10);await page.keyboard.press('Home');assert.equal((await page.locator('#project-tree').boundingBox()).width,200);await page.keyboard.press('End');assert.equal((await page.locator('#project-tree').boundingBox()).width,600);await page.keyboard.press('Shift+ArrowLeft');assert.equal((await page.locator('#project-tree').boundingBox()).width,550);
 });}finally{await browser.close();}
});
test('E2E: tree can resize on a small screen and in plan view without changing geometry or shifting the canvas',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('line',[[200,200],[500,200]]);const geometry=await read(),canvasBefore=await page.locator('#plan-surface').boundingBox();await page.locator('#project-tree-toggle').click();await drag(page,420);assert.equal((await page.locator('#project-tree').boundingBox()).width,420);assert.deepEqual(await read(),geometry);assert.deepEqual(await page.locator('#plan-surface').boundingBox(),canvasBefore);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#project-tree').hidden);assert.equal(await page.locator('#project-tree-resize').isHidden(),true);await page.locator('#project-tree-toggle').click();assert.ok((await page.locator('#project-tree').boundingBox()).width<=358);await drag(page,260);assert.equal((await page.locator('#project-tree').boundingBox()).width,260);assert.equal(await page.locator('#project-tree-resize').getAttribute('aria-valuemax'),'358');await page.locator('#project-tree-close').click();assert.equal(await page.locator('#project-tree-resize').isHidden(),true);assert.deepEqual(await read(),geometry);
 });}finally{await browser.close();}
});
