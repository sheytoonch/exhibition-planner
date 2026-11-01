require('./offline-tests.cjs');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {launch,session}=require('./cad-test-helpers.cjs');
let browser;before(async()=>browser=await launch());after(async()=>browser?.close());
async function inject(page,key,mode){
 await page.evaluate(({key,mode})=>{
  window.auditFault=mode;window.auditFaultHits=0;
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,k){
   if(k===key&&window.auditFault){
    window.auditFaultHits++;
    if(window.auditFault==='quota')throw new DOMException('Injected quota failure','QuotaExceededError');
    const request=put.apply(this,arguments),transaction=this.transaction;queueMicrotask(()=>transaction.abort());return request;
   }
   return put.apply(this,arguments);
  };
 },{key,mode});
}
async function stored(page,key){return page.evaluate(key=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('exhibition-planner-v2',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
  const db=request.result,tx=db.transaction('library'),q=tx.objectStore('library').get(key);
  tx.oncomplete=()=>{db.close();resolve(q.result);};tx.onabort=()=>reject(tx.error);
 };
}),key);}
for(const mode of ['quota','abort']){
 test('E2E: image '+mode+' failure reports session-only data and allows retry and reload',async()=>{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
   await page.locator('#image-files').setInputFiles({name:'Audit 80x100cm.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="red"/></svg>')});
   await page.locator('input[name="title"]').fill('Audit');await page.locator('input[name="title"]').blur();
   await page.waitForFunction(()=>document.querySelector('#storage-status').textContent==='Zapisano w tej przeglądarce.');
   const before=await stored(page,'images');assert.equal(before[0].image.accepted===true,false);
   await inject(page,'images',mode);await page.locator('.save-image').click();
   await page.waitForFunction(()=>document.querySelector('.save-image-info').textContent.includes('Zapisano tylko w sesji'));
   assert.ok(await page.evaluate(()=>window.auditFaultHits>0));
   assert.doesNotMatch(await page.locator('.save-image-info').innerText(),/Zapisano w przeglądarce/);
   const durable=await stored(page,'images');assert.equal(durable[0].image.accepted===true,false,'failed acceptance never replaces persisted record');
   assert.equal(await page.locator('.image-card').count(),1,'editing remains recoverable in this session');
   await page.evaluate(()=>window.auditFault=null);
   await page.locator('.edit-details').click();await page.locator('.save-image').click();
   await page.waitForFunction(()=>document.querySelector('.save-image-info').textContent.includes('Zapisano w przeglądarce'));
   await page.reload();await page.locator('.image-card').waitFor();
   assert.equal(await page.locator('input[name="title"]').inputValue(),'Audit');
   assert.equal((await stored(page,'images'))[0].image.accepted,true);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 });
 test('E2E: plan '+mode+' failure preserves persisted geometry and recovers all pending edits',async()=>{
  await session(browser,async({page,draw,read})=>{
   await draw('line',[[200,250],[400,250]]);const before=await read();assert.equal(before.lines.length,1);
   await inject(page,'plan',mode);
   await draw('line',[[200,350],[400,350]]);
   await page.waitForFunction(()=>document.querySelector('#plan-save-status').textContent.includes('Nie udało się zapisać rzutu'));
   assert.ok(await page.evaluate(()=>window.auditFaultHits>0));
   assert.deepEqual(await read(),before,'failure must preserve the last persisted geometry');
   await page.evaluate(()=>window.auditFault=null);
   await draw('line',[[200,450],[400,450]]);
   await page.waitForFunction(()=>document.querySelector('#plan-save-status').textContent==='');
   const recovered=await read();assert.equal(recovered.lines.length,3,'both pending and subsequent UI edits are saved');
   await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
   assert.deepEqual(await read(),recovered);
  });
 });
}


test('E2E: changing database version closes the old connection and keeps subsequent plan edits explicitly session-only',async()=>{
 await session(browser,async({page,draw,read})=>{
  await draw('line',[[200,250],[400,250]]);const before=await read();
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('exhibition-planner-v2',2);r.onerror=()=>reject(r.error);r.onsuccess=()=>{r.result.close();resolve();};}));
  assert.match(await page.locator('#storage-status').innerText(),/Otw.rz ponownie/);
  await page.locator('#plan-line').click();const box=await page.locator('#plan-surface').boundingBox();
  await page.mouse.click(box.x+box.width*.2,box.y+box.height*.5);await page.mouse.click(box.x+box.width*.4,box.y+box.height*.5);await page.keyboard.press('Escape');
  assert.match(await page.locator('#plan-save-status').innerText(),/tylko w tej sesji/);
  const durable=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('exhibition-planner-v2');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline);};};}));
  assert.deepEqual(durable,before);
 });
});

test('E2E: unavailable IndexedDB still allows image editing without claiming persistent storage',async()=>{
 const context=await browser.newContext(),page=await context.newPage();
 try{
  await page.addInitScript(()=>{indexedDB.open=()=>{throw new DOMException('Injected unavailable database','SecurityError');};});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.locator('#image-files').setInputFiles({name:'Audit 80x100cm.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="red"/></svg>')});
  await page.locator('input[name="title"]').fill('Session only');await page.locator('.save-image').click();
  await page.waitForFunction(()=>document.querySelector('.save-image-info').textContent.includes('Zapisano tylko w sesji'));
  assert.equal(await page.locator('.image-card').count(),1);assert.match(await page.locator('#storage-status').innerText(),/niedost.pny/);
  assert.doesNotMatch(await page.locator('.save-image-info').innerText(),/Zapisano w przegl.darce/);
 }finally{await context.close();}
});


test('E2E: an unreadable image record reports unavailable storage without overwriting the persisted data',async()=>{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForFunction(()=>!document.querySelector('#add-images').disabled);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('exhibition-planner-v2');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library','readwrite');tx.objectStore('library').put([{image:{id:'corrupted-audit-record',title:'Preserve this record',blob:null}}],'images');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('niedost'));
  const records=await stored(page,'images');assert.equal(records.length,1);assert.equal(records[0].image.id,'corrupted-audit-record');
  assert.equal(await page.locator('#add-images').isDisabled(),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
