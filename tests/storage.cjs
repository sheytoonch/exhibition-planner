const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const artifacts=path.resolve(__dirname,'test-runs/artifacts');fs.mkdirSync(artifacts,{recursive:true});
 const profile=fs.mkdtempSync(path.join(artifacts,'storage-profile-'));
 const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
 const launch=()=>chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 let context=await launch();
 try{
  let page=await context.newPage();await page.goto(url);
  await page.locator('#image-files').setInputFiles({name:'Test - 80x100cm.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="red"/></svg>')});
  await page.locator('input[name="title"]').fill('Zapisany obraz');
  await page.locator('input[name="widthCm"]').fill('80');await page.locator('input[name="heightCm"]').fill('100');
  await page.locator('.save-image').click();await page.waitForFunction(()=>!document.querySelector('.save-image').disabled);
  assert.match(await page.locator('.save-image-info').textContent(),/Zapisano w przeglądarce/);
  await page.reload();await page.locator('.image-card').waitFor();
  assert.equal(await page.locator('input[name="title"]').inputValue(),'Zapisany obraz');
  assert.equal(await page.locator('#undo').isDisabled(),true);
  await context.close();context=await launch();page=await context.newPage();await page.goto(url);await page.locator('.image-card').waitFor();
  assert.equal(await page.locator('input[name="title"]').inputValue(),'Zapisany obraz');
  assert.deepEqual(await page.locator('.image-card img').evaluate(async i=>{await i.decode();return[i.naturalWidth,i.naturalHeight];}),[320,400]);
  assert.equal(await page.locator('#undo').isDisabled(),true);
  await page.locator('.reject-image').click();await page.waitForFunction(()=>document.querySelector('#storage-status').textContent==='Zapisano w tej przeglądarce.');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#storage-status').textContent==='Zapis lokalny jest włączony.');
  assert.equal(await page.locator('.image-card').count(),0);
  console.log('OK: file:// IndexedDB, reload, browser restart, metadata, lightweight blob, empty history, permanent rejection.');
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
