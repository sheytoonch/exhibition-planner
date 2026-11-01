const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage();
  await page.clock.install({time:new Date('2026-10-18T12:00:00')});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.locator('#image-files').setInputFiles({name:'Obraz 9399.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="red"/></svg>')});
  const input=page.locator('input[name="date"]');await input.waitFor();
  assert.equal(await input.getAttribute('aria-invalid'),'true');
  for(const value of ['9399','2027','11.2026','19.10.2026','2020–2027','05.2020–11.2026','po 2026','przed 2027','ok. 2027']){
   await input.fill(value);assert.equal(await input.evaluate(e=>e.checkValidity()),false,value);
   assert.match(await input.evaluate(e=>e.validationMessage),/przyszłości/);
  }
  for(const value of ['','2026','10.2026','18.10.2026','2020–2026','05.2020–10.2026','po 2020','przed 2020','1920/25']){
   await input.fill(value);assert.equal(await input.evaluate(e=>e.checkValidity()),true,value);
  }
  console.log('OK: future dates, ranges, automatic filename detection, current day/month/year.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
