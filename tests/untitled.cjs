const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.locator('#image-files').setInputFiles({name:'Praca.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')});
  const title=page.locator('input[name="title"]'),option=page.locator('.untitled-option input');
  await title.waitFor();assert.equal(await title.evaluate(e=>e.checkValidity()),false);
  await option.check();assert.equal(await title.isDisabled(),true);
  await page.locator('#undo').click();assert.equal(await option.isChecked(),false);assert.equal(await title.isDisabled(),false);
  await page.locator('#redo').click();assert.equal(await option.isChecked(),true);
  await page.locator('input[name="widthCm"]').fill('80');await page.locator('input[name="heightCm"]').fill('100');
  await page.locator('.save-image').click();await page.waitForFunction(()=>!document.querySelector('.save-image').disabled);
  assert.equal(await page.locator('.accepted-summary h3').textContent(),'Bez tytułu');
  await page.reload();await page.locator('.accepted-summary').waitFor();assert.equal(await page.locator('.accepted-summary h3').textContent(),'Bez tytułu');
  await page.locator('.edit-details').click();assert.equal(await option.isChecked(),true);
  await option.uncheck();assert.equal(await title.evaluate(e=>e.checkValidity()),false);
  await page.locator('.cancel-details').click();assert.equal(await option.isChecked(),true);
  assert.equal(await page.locator('.accepted-summary h3').textContent(),'Bez tytułu');
  assert.deepEqual(errors,[]);console.log('OK: explicit untitled choice, title validation, history, acceptance, reload and cancel.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
