const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const theme=()=>page.locator('html').getAttribute('data-theme');assert.equal(await theme(),'dark');
  assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(22, 27, 24)');
  await page.locator('#theme-toggle').click();assert.equal(await theme(),'light');await page.reload();assert.equal(await theme(),'light');
  await page.locator('#theme-toggle').click();await page.reload();assert.equal(await theme(),'dark');
  await page.locator('#image-files').setInputFiles({name:'Test - Akryl na płótnie 80x100cm.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')});
  await page.locator('.image-card').waitFor();
  assert.equal(await page.locator('.source-filename').evaluate(e=>getComputedStyle(e).color),'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('.source-highlights').evaluate(e=>getComputedStyle(e).color),'rgb(229, 235, 228)');
  assert.equal(await page.locator('.image-card img').evaluate(e=>getComputedStyle(e).filter),'none');
  await page.screenshot({path:'tests/test-runs/artifacts/dark.png'});
  await page.locator('.reject-image').click();await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await page.locator('[data-tool-menu=line-method-menu]').click();
  const canvas=page.locator('#plan-lines'),r=await canvas.boundingBox();await page.mouse.click(r.x+100,r.y+100);await page.mouse.click(r.x+300,r.y+200);
  await page.screenshot({path:'tests/test-runs/artifacts/dark-plan.png'});
  assert.deepEqual(errors,[]);console.log('OK: default dark, theme switching and persistence, source highlights, unchanged artwork colors, plan canvas.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
