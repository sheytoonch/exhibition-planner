const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);
  await page.evaluate(()=>new Promise(resolve=>{
   const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library','readwrite');
    tx.objectStore('library').put({version:2,active:'legacy',plans:[{id:'legacy',name:'Stary rzut',aspect:2,blob:new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"/>'],{type:'image/svg+xml'}),outline:{width:1000,height:500,metersPerUnit:.02,lines:[{a:{x:100,y:150},b:{x:300,y:150},locked:true}]}}]},'plan');tx.oncomplete=()=>{db.close();resolve();};};
  }));
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();
  assert.equal(await page.locator('#plan-image').isVisible(),true);
  await page.locator('#plan-files').setInputFiles({name:'Nowa grafika.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')});
  await page.waitForFunction(()=>!document.querySelector('#plan-import').disabled);
  const saved=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result);};};}));
  assert.equal(saved.plans.length,1);assert.equal(saved.plans[0].backgrounds.length,2);assert.equal(saved.plans[0].blob,undefined);
  assert.equal(saved.plans[0].outline.metersPerUnit,.02);assert.deepEqual(saved.plans[0].outline.lines.map(line=>({a:{x:line.a.x,y:line.a.y},b:{x:line.b.x,y:line.b.y},locked:line.locked})),[{a:{x:100,y:150},b:{x:300,y:150},locked:true}]);
  assert.equal(saved.plans[0].backgrounds[0].width,1000);assert.equal(saved.plans[0].backgrounds[0].height,500);
  assert.deepEqual(errors,[]);console.log('OK: existing plan migration preserves artwork, geometry, scale and locks; new image joins same plan.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
