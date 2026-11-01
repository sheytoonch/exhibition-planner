const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await page.locator('[data-plan-shape="polyline"]').click();
  async function click(x,y){const r=await page.locator('#plan-surface').boundingBox();await page.mouse.click(r.x+r.width*x/1000,r.y+r.height*y/700);}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline.lines);};};}));
  await click(100,100);await click(300,100);await click(300,300);await click(100,300);await click(102,102);
  let lines=await stored();assert.equal(lines.length,4);assert.equal(new Set(lines.map(line=>line.polylineId)).size,1);assert.ok(lines[0].polylineId);for(let i=0;i<4;i++)assert.deepEqual(lines[i].b,lines[(i+1)%4].a);
  await click(500,100);await page.keyboard.down('Shift');await click(700,120);await page.keyboard.up('Shift');await page.keyboard.press('Enter');
  lines=await stored();assert.equal(lines.length,5);assert.equal(lines[4].a.y,lines[4].b.y);assert.notEqual(lines[4].polylineId,lines[0].polylineId);
  await click(800,500);await page.keyboard.press('Escape');assert.equal((await stored()).length,5);
  await page.locator('[data-plan-shape="polyline"]').click();await click(600,500);await click(700,550);await click(800,600);await page.keyboard.press('Escape');lines=await stored();assert.equal(lines.length,7);assert.deepEqual(lines[5].b,lines[6].a);assert.equal(lines[5].polylineId,lines[6].polylineId);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);assert.deepEqual(await stored(),lines);assert.deepEqual(errors,[]);console.log('OK: continuous connected segments, closure snapping, Shift, Enter, Escape, separate polylines and persistence.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
