const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();
  async function point(x,y){const r=await page.locator('#plan-surface').boundingBox();return{x:r.x+r.width*x/1000,y:r.y+r.height*y/700};}
  async function click(x,y){const p=await point(x,y);await page.mouse.click(p.x,p.y);}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline);};};}));
  await page.locator('[data-tool-menu=line-method-menu]').click();await click(200,200);await click(600,200);await click(200,200);await click(200,500);await page.keyboard.press('Escape');
  assert.equal(await page.locator('#plan-board').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(36, 36, 36)');
  const p=await point(400,200);const sample=()=>page.locator('#plan-lines').evaluate((canvas,p)=>{const r=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d');return Array.from(ctx.getImageData(Math.round((p.x-r.left)*canvas.width/r.width),Math.round((p.y-r.top)*canvas.height/r.height),1,1).data);},p);
  await page.mouse.move(10,10);const before=await sample();await page.mouse.move(p.x,p.y);const after=await sample();assert.notDeepEqual(after,before);
  await page.locator('[data-plan-measure="length"]').click();await click(400,200);let geometry=await stored();assert.equal(geometry.lines[0].showLength,true);
  await page.locator('[data-plan-measure="angle"]').click();await click(400,200);await click(200,350);geometry=await stored();assert.equal(geometry.angles.length,1);assert.equal(geometry.angles[0].a,geometry.lines[0].id);assert.equal(geometry.angles[0].b,geometry.lines[1].id);
  await page.screenshot({path:'tests/test-runs/artifacts/dimensions.png'});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);geometry=await stored();assert.equal(geometry.angles.length,1);assert.equal(geometry.lines[0].showLength,true);
  await page.locator('[data-plan-measure="angle"]').click();await click(400,200);await click(200,350);assert.equal((await stored()).angles.length,1);assert.equal(await page.locator('#line-properties').isVisible(),true);
  await page.locator('[data-plan-measure="length"]').click();await click(400,200);assert.equal((await stored()).lines[0].showLength,true);assert.equal(await page.locator('#line-properties').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('OK: neutral background, hover highlight, length labels, angle labels, toggling and persistence.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
