const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:900}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);
  await page.locator('#accepted-tab').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#accepted-tab').getAttribute('aria-selected')==='true');
  await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await page.locator('#plan-empty').click();
  await page.locator('#plan-list button').first().click();await page.locator('#plan-zoom-in').click();await page.locator('#plan-zoom-in').click();
  const canvas=page.locator('#plan-lines'),box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+55,box.y+box.height/2+35);await page.mouse.up();
  const before=await page.locator('#plan-surface').boundingBox();
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view').hidden);
  assert.equal(await page.locator('#plan-list button').first().getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#plan-zoom-reset').textContent(),'196%');
  const after=await page.locator('#plan-surface').boundingBox();assert.ok(Math.abs(before.x-after.x)<1);assert.ok(Math.abs(before.y-after.y)<1);
  await page.locator('#library-view-button').click();assert.equal(await page.locator('#accepted-tab').getAttribute('aria-selected'),'true');
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);assert.equal(await page.locator('#library-view').isVisible(),true);
  assert.equal(await page.locator('#accepted-tab').getAttribute('aria-selected'),'true');
  await page.locator('#image-files').setInputFiles(Array.from({length:6},(_,i)=>({name:`Obraz ${i}.svg`,mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')})));
  await page.waitForFunction(()=>document.querySelectorAll('.image-card').length===6&&!document.querySelector('#add-images').disabled);
  await page.evaluate(()=>window.scrollTo(0,450));
  await page.waitForFunction(async()=>new Promise(resolve=>{const request=indexedDB.open('exhibition-planner-v2',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('library'),q=tx.objectStore('library').get('uiState');tx.oncomplete=()=>{db.close();resolve(Math.abs((q.result?.scroll?.library||0)-450)<2);};};}));
  await page.reload();await page.waitForFunction(()=>Math.abs(window.scrollY-450)<2);
  assert.deepEqual(errors,[]);console.log('OK: view, library tab, active plan, zoom and pan restored after reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
