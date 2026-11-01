const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await page.locator('[data-tool-menu=line-method-menu]').click();
  async function point(x,y){const r=await page.locator('#plan-surface').boundingBox();return{x:r.x+r.width*x/1000,y:r.y+r.height*y/700};}async function click(x,y){const p=await point(x,y);await page.mouse.click(p.x,p.y);}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline.lines[0]);};};}));
  await click(100,100);await click(300,200);await page.keyboard.press('Escape');await click(200,150);
  const form=page.locator('#line-properties'),binding=form.locator('[name="directionBinding"]'),apply=()=>form.locator('button[type="submit"]').click();
  await binding.selectOption('horizontal');await apply();let line=await stored();assert.equal(line.directionBinding.mode,'horizontal');assert.ok(Math.abs(line.b.y-line.a.y)<.001);
  const endpoint=await point(line.b.x,line.b.y);await page.mouse.move(endpoint.x,endpoint.y);await page.mouse.down();await page.mouse.move(endpoint.x+40,endpoint.y+50);await page.mouse.up();line=await stored();assert.ok(Math.abs(line.b.y-line.a.y)<.001);
  await binding.selectOption('vertical');await apply();line=await stored();assert.equal(line.directionBinding.mode,'vertical');assert.ok(Math.abs(line.b.x-line.a.x)<.001);
  assert.equal(await form.locator('[name="directionAngle"]').isVisible(),true);await form.locator('[name="directionAngle"]').fill('30');await page.keyboard.press('Tab');line=await stored();assert.equal(line.directionBinding.mode,'angle');assert.equal(line.directionBinding.degrees,30);assert.ok(Math.abs((line.b.y-line.a.y)/(line.b.x-line.a.x)+Math.tan(Math.PI/6))<1e-5);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);let restored=await stored();assert.deepEqual(restored.directionBinding,line.directionBinding);
  await click(line.a.x*.8+line.b.x*.2,line.a.y*.8+line.b.y*.2);await binding.selectOption('none');await apply();assert.equal((await stored()).directionBinding,null);
  assert.deepEqual(errors,[]);console.log('OK: horizontal, vertical, custom angle, dragging preserves binding, persistence and release.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
