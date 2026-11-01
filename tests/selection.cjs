const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();
  async function point(x,y){const r=await page.locator('#plan-surface').boundingBox();return{x:r.x+r.width*x/1000,y:r.y+r.height*y/700};}
  async function click(x,y){const p=await point(x,y);await page.mouse.click(p.x,p.y);}
  async function drag(x,y,toX,toY){const a=await point(x,y),b=await point(toX,toY);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active));};};}));
  await page.locator('[data-tool-menu=line-method-menu]').click();await click(100,100);await click(300,100);await page.locator('[data-plan-shape="circle"]').click();await click(500,200);await click(550,200);await page.keyboard.press('Escape');
  assert.equal(await page.locator('#plan-select').getAttribute('aria-pressed'),'true');
  await drag(50,50,600,300);assert.match(await page.locator('#plan-selection-count').textContent(),/2/);
  await drag(200,100,250,150);let data=await stored();assert.ok(Math.abs(data.outline.lines[0].a.x-150)<1);assert.ok(Math.abs(data.outline.shapes[0].center.x-550)<1);
  await page.locator('#selection-lock').click();data=await stored();assert.equal(data.outline.lines[0].locked,true);assert.equal(data.outline.shapes[0].locked,true);
  await drag(250,150,300,180);assert.deepEqual((await stored()).outline,data.outline);assert.equal(await page.locator('#selection-delete').isDisabled(),true);
  await page.locator('#selection-unlock').click();await page.locator('#plan-lines').focus();await page.keyboard.press('Delete');data=await stored();assert.equal(data.outline.lines.length,0);assert.equal(data.outline.shapes.length,0);
  await page.locator('[data-plan-shape="arc"]').click();await click(200,400);await click(300,300);await click(400,400);await page.keyboard.press('Escape');await click(300,300);assert.match(await page.locator('#plan-selection-count').textContent(),/1/);await page.locator('#selection-delete').click();assert.equal((await stored()).outline.shapes.length,0);
  await page.locator('#plan-files').setInputFiles({name:'Podklad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')});await page.waitForFunction(()=>!document.querySelector('#plan-import').disabled);
  await click(350,350);assert.match(await page.locator('#plan-selection-count').textContent(),/1/);await drag(350,350,400,380);data=await stored();assert.ok(data.backgrounds[0].x>1);await page.locator('#selection-lock').click();assert.equal((await stored()).backgrounds[0].locked,true);await page.locator('#selection-unlock').click();await page.locator('#selection-delete').click();assert.equal((await stored()).backgrounds.length,0);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);data=await stored();assert.equal(data.backgrounds.length,0);assert.deepEqual(errors,[]);console.log('OK: Escape selection, marquee, group move, group locks, Delete, arc and background selection/move/delete, persistence.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
