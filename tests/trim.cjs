const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await page.locator('[data-tool-menu=line-method-menu]').click();
  async function click(x,y){const r=await page.locator('#plan-surface').boundingBox();await page.mouse.click(r.x+r.width*x/1000,r.y+r.height*y/700);}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline);};};}));
  await click(100,350);await click(900,350);await click(350,100);await click(350,600);await click(650,100);await click(650,600);
  await page.locator('#plan-trim').click();await click(500,350);let model=await stored();assert.equal(model.lines.length,4);assert.ok(Math.abs(model.lines[0].b.x-350)<1);assert.ok(Math.abs(model.lines[1].a.x-650)<1);
  await page.locator('#plan-select').click();await click(200,350);await page.locator('#line-lock').click();await page.locator('#plan-trim').click();await click(200,350);assert.match(await page.locator('#plan-import-status').textContent(),/odblokuj/);assert.equal((await stored()).lines.length,4);
  model=await stored();await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);assert.deepEqual((await stored()).lines,model.lines);assert.deepEqual(errors,[]);console.log('OK: clicking a fragment trims it, preserves locked lines and persists after reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
