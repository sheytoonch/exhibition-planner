require('./offline-tests.cjs');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.locator('#image-files').setInputFiles([1,2].map(i=>({name:`Test ${i}.svg`,mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')})));
  const authors=page.locator('input[name="author"]');await authors.nth(1).waitFor();
  await authors.first().fill('abcd');await authors.first().blur();
  await authors.nth(1).focus();assert.equal(await page.locator('.author-suggestions:visible button').textContent(),'abcd');
  assert.equal(await authors.nth(1).inputValue(),'');
  await authors.nth(1).fill('ab');assert.equal(await page.locator('.author-suggestions:visible button').textContent(),'abcd');
  await authors.nth(1).press('ArrowDown');await authors.nth(1).press('Enter');assert.equal(await authors.nth(1).inputValue(),'abcd');
  await authors.nth(1).fill('Jan Nowak');await authors.nth(1).blur();await authors.first().fill('');await authors.first().focus();assert.equal(await page.locator('.author-suggestions:visible button').textContent(),'Jan Nowak');
  await authors.first().fill('ab');await page.locator('.author-suggestions:visible button').click();assert.equal(await authors.first().inputValue(),'abcd');
  await page.waitForFunction(()=>document.querySelector('#storage-status').textContent==='Zapisano w tej przeglądarce.');
  await page.reload();await authors.nth(1).waitFor();assert.equal(await authors.first().inputValue(),'abcd');assert.equal(await authors.nth(1).inputValue(),'Jan Nowak');
  await authors.nth(1).fill('ab');assert.equal(await page.locator('.author-suggestions:visible button').textContent(),'abcd');
  assert.deepEqual(errors,[]);console.log('OK: last author, prefix suggestions, mouse/keyboard selection, author storage across reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
