require('./offline-tests.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const cases=[
   ['Jan Matejko - Bitwa pod Grunwaldem, 1878 r., olej na płótnie, 426 x 987 cm.svg','987','426','1878'],
   ['obraz_1920x1080_ok1920r.svg','','','ok. 1920'],
   ['Portrait_18th_century_H120xW90cm_300dpi.svg','90','120','18th century'],
   ['Untitled (ca. 1945-1950), 24" x 36", mixed media.svg','91.44','60.96','ok. 1945–1950'],
   ['IMG_20230512_120000_150x100mm.svg','15','10','12.05.2023'],
   ['Obiekt_Muzealny_2 poł. XIX w._wym_120.5x80cm.svg','120.5','80','2 poł. XIX w.'],
   ['IMG_2024_03_29.svg','','','29.03.2024'],
  ];
  await page.locator('#image-files').setInputFiles(cases.map(([name])=>({name,mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="green"/></svg>')})));
  await page.waitForFunction(count=>document.querySelectorAll('.image-card').length===count&&!document.getElementById('add-images').disabled,cases.length);
  for(const [i,[name,w,h,date]]of cases.entries()){
   const card=page.locator('.image-card').nth(i);
   assert.equal(await card.getByLabel('Szerokość',{exact:true}).inputValue(),w,name);
   assert.equal(await card.getByLabel('Wysokość',{exact:true}).inputValue(),h,name);
   assert.equal(await card.getByLabel('Data (opcjonalnie)',{exact:true}).inputValue(),date,name);
   assert.equal(await card.getByLabel('Data (opcjonalnie)',{exact:true}).getAttribute('aria-invalid'),'false',name);
   assert.equal(await card.locator('.source-mark[data-field="date"]').count(),1,name);
  }
  assert.deepEqual(errors,[]);console.log('OK: cały import przykładów muzealnych i cyfrowych, oznaczenia i poprawność pól.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
