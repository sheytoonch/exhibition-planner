const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await page.locator('[data-tool-menu=line-method-menu]').click();
  async function click(x,y){const r=await page.locator('#plan-surface').boundingBox();await page.mouse.click(r.x+r.width*x/1000,r.y+r.height*y/700);}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline);};};}));
  const near=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);const form=page.locator('#line-properties'),apply=()=>form.locator('button[type="submit"]').click();
  await click(100,100);await click(400,100);await click(400,100);await click(400,400);await page.keyboard.press('Escape');
  await click(400,250);await form.locator('[name="reference"]').selectOption('0');await form.locator('[name="lineLength"]').fill('3');await form.locator('[name="lineAngle"]').fill('90');await apply();
  await click(250,100);await form.locator('[name="lineLength"]').fill('5');await apply();
  let geometry=await stored();near(geometry.lines[0].b.x,600);near(geometry.lines[1].a.x,600);near(geometry.lines[1].b.x,600);near(geometry.lines[1].b.y,400);assert.equal(geometry.lines[1].fixedLength,3);assert.equal(geometry.lines[1].fixedAngle.degrees,90);
  await click(600,250);await form.locator('[name="fixLength"]').uncheck();await form.locator('[name="fixAngle"]').uncheck();await apply();
  await click(350,100);await form.locator('[name="lineLength"]').fill('6');await apply();geometry=await stored();near(geometry.lines[0].b.x,700);near(geometry.lines[1].a.x,700);near(geometry.lines[1].b.x,600);near(geometry.lines[1].b.y,400);assert.equal(geometry.lines[1].fixedLength,null);
  await click(650,250);await page.locator('#line-lock').click();const before=await stored();
  await click(400,100);await form.locator('[name="lineLength"]').fill('7');await apply();assert.match(await page.locator('#plan-import-status').textContent(),/Nie można spełnić/);assert.deepEqual((await stored()).lines,before.lines);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);geometry=await stored();assert.equal(geometry.lines[0].fixedLength,6);assert.equal(geometry.lines[1].locked,true);assert.deepEqual(errors,[]);console.log('OK: numeric edits move connected geometry, fixed lengths/angles persist, free lengths stretch, conflicting locks roll back.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
