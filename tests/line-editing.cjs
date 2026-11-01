const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1200}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await page.locator('[data-tool-menu=line-method-menu]').click();
  async function point(x,y){const r=await page.locator('#plan-surface').boundingBox();return{x:r.x+r.width*x/1000,y:r.y+r.height*y/700};}
  async function click(x,y){const p=await point(x,y);await page.mouse.click(p.x,p.y);}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline);};};}));
  await click(100,100);await click(400,100);await click(100,300);await click(400,450);
  await page.locator('#plan-select').click();await click(250,100);
  const form=page.locator('#line-properties');assert.equal(await form.isVisible(),true);
  await form.locator('[name="lineLength"]').fill('4');await form.locator('[name="lineAngle"]').fill('0');await form.locator('button[type="submit"]').click();
  let model=await stored();assert.ok(Math.abs(Math.hypot(model.lines[0].b.x-model.lines[0].a.x,model.lines[0].b.y-model.lines[0].a.y)*model.metersPerUnit-4)<1e-6);
  await click(250,375);await form.locator('[name="reference"]').selectOption('0');await form.locator('[name="lineLength"]').fill('2');await form.locator('[name="lineAngle"]').fill('90');await form.locator('button[type="submit"]').click();
  model=await stored();assert.ok(Math.abs(model.lines[1].a.x-model.lines[1].b.x)<1e-6);assert.ok(Math.abs(Math.hypot(model.lines[1].b.x-model.lines[1].a.x,model.lines[1].b.y-model.lines[1].a.y)*model.metersPerUnit-2)<1e-6);
  await page.locator('#line-collinear').click();model=await stored();assert.ok(Math.abs(model.lines[1].a.y-model.lines[0].a.y)<1e-6);assert.ok(Math.abs(model.lines[1].b.y-model.lines[0].a.y)<1e-6);
  const line=model.lines[1],mid={x:(line.a.x+line.b.x)/2,y:(line.a.y+line.b.y)/2};const p=await point(mid.x,mid.y);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+40,p.y+35);await page.mouse.up();
  const moved=await stored();assert.ok(Math.abs(moved.lines[1].a.y-line.a.y)>1);assert.ok(Math.abs(Math.hypot(moved.lines[1].b.x-moved.lines[1].a.x,moved.lines[1].b.y-moved.lines[1].a.y)-200)<1e-6);
  assert.ok([moved.lines[1].a,moved.lines[1].b].some(point=>Math.hypot(point.x-moved.lines[0].a.x,point.y-moved.lines[0].a.y)<1e-6));
  async function selectLine(line){const t=line.id===moved.lines[0].id?.9:.5;await click(line.a.x+(line.b.x-line.a.x)*t,line.a.y+(line.b.y-line.a.y)*t);}
  await selectLine(moved.lines[0]);await page.locator('#line-lock').click();
  let locked=await stored();assert.equal(locked.lines[0].locked,true);assert.equal(await form.locator('[name="lineLength"]').isDisabled(),true);
  const center=await point((locked.lines[0].a.x+locked.lines[0].b.x)/2,(locked.lines[0].a.y+locked.lines[0].b.y)/2);
  await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+40,center.y+40);await page.mouse.up();assert.deepEqual((await stored()).lines,locked.lines);
  await selectLine(locked.lines[1]);const neighbor=await point((locked.lines[1].a.x+locked.lines[1].b.x)/2,(locked.lines[1].a.y+locked.lines[1].b.y)/2);
  await page.mouse.move(neighbor.x,neighbor.y);await page.mouse.down();await page.mouse.move(neighbor.x+35,neighbor.y+25);await page.mouse.up();assert.deepEqual((await stored()).lines,locked.lines);
  await selectLine(locked.lines[0]);await page.locator('#line-lock').click();assert.equal((await stored()).lines[0].locked,false);assert.equal(await form.locator('[name="lineLength"]').isDisabled(),false);
  await page.locator('#line-lock').click();locked=await stored();
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);assert.deepEqual((await stored()).lines,locked.lines);
  assert.deepEqual(errors,[]);console.log('OK: selection, metric length, relative angle, collinearity, dragging, connected endpoints, persistence.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
