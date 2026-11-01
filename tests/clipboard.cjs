require('./offline-tests.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('@playwright/test');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  // Test zdarzenia paste z kontrolowanymi danymi, bez odczytu lub zmiany schowka systemowego.
  async function paste(count, target='body'){
   return page.evaluate(async({count,target})=>{
    const canvas=document.createElement('canvas');canvas.width=20;canvas.height=30;
    canvas.getContext('2d').fillRect(0,0,20,30);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const data=new DataTransfer();
    for(let i=0;i<count;i++)data.items.add(new File([blob],'image.png',{type:'image/png'}));
    const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});
    document.querySelector(target).dispatchEvent(event);return event.defaultPrevented;
   },{count,target});
  }
  assert.equal(await paste(1),true);
  await page.waitForFunction(()=>document.querySelectorAll('.image-card').length===1&&!document.getElementById('add-images').disabled);
  assert.equal(await page.getByRole('textbox',{name:'Nazwa pliku lub opis',exact:true}).inputValue(),'Wklejony obraz 1.png');
  const title=page.getByLabel('Tytuł',{exact:true});await title.fill('Mój obraz');await title.focus();
  assert.equal(await paste(2,'input[name="title"]'),true);
  await page.waitForFunction(()=>document.querySelectorAll('.image-card').length===3&&!document.getElementById('add-images').disabled);
  assert.equal(await title.first().inputValue(),'Mój obraz');
  assert.equal(await page.getByRole('textbox',{name:'Nazwa pliku lub opis',exact:true}).nth(2).inputValue(),'Wklejony obraz 3.png');
  const prevented=await page.evaluate(()=>{
   const data=new DataTransfer();data.setData('text/plain','Tekst do wklejenia');
   const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});
   document.querySelector('input[name="title"]').dispatchEvent(event);return event.defaultPrevented;
  });
  assert.equal(prevented,false);
  assert.equal(await page.locator('.image-card').count(),3);
  const sizes=await page.locator('.image-card img').evaluateAll(async images=>{await Promise.all(images.map(image=>image.decode()));return images.map(image=>[image.naturalWidth,image.naturalHeight]);});
  assert.deepEqual(sizes,[[20,30],[20,30],[20,30]]);
  assert.deepEqual(errors,[]);
  console.log('OK: paste jednego i wielu obrazów, nazwy ze schowka, zachowanie tekstu w polach i poprawne podglądy.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
