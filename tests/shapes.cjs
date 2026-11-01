const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();
  async function click(x,y){const r=await page.locator('#plan-surface').boundingBox();await page.mouse.click(r.x+r.width*x/1000,r.y+r.height*y/700);}
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline);};};}));
  await page.locator('[data-plan-shape="rectangle"]').click();await click(100,100);await click(350,250);let geometry=await stored();assert.equal(geometry.lines.length,4);
  for(let i=0;i<4;i++)assert.deepEqual(geometry.lines[i].b,geometry.lines[(i+1)%4].a);
  await click(500,100);await page.keyboard.down('Shift');await click(650,180);await page.keyboard.up('Shift');geometry=await stored();assert.equal(geometry.lines.length,8);assert.ok(Math.abs(Math.hypot(geometry.lines[4].b.x-geometry.lines[4].a.x,geometry.lines[4].b.y-geometry.lines[4].a.y)-Math.hypot(geometry.lines[5].b.x-geometry.lines[5].a.x,geometry.lines[5].b.y-geometry.lines[5].a.y))<1e-6);
  await page.locator('[data-plan-shape="circle"]').click();await click(200,400);await click(280,400);geometry=await stored();assert.equal(geometry.shapes[0].type,'circle');assert.ok(Math.abs(geometry.shapes[0].radius-80)<1);
  await page.locator('[data-plan-shape="arc"]').click();await click(450,450);await click(550,350);await click(650,450);geometry=await stored();assert.equal(geometry.shapes[1].type,'arc');
  await click(100,600);await click(200,600);await click(300,600);assert.match(await page.locator('#plan-import-status').textContent(),/jednej prostej/);assert.equal((await stored()).shapes.length,2);await page.keyboard.press('Escape');
  await page.locator('[data-plan-shape="circle"]').click();await click(800,550);await page.keyboard.press('Escape');assert.equal((await stored()).shapes.length,2);
  await page.screenshot({path:'tests/test-runs/artifacts/shapes.png'});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('plan-view-button').disabled);const restored=await stored();assert.equal(restored.lines.length,8);assert.deepEqual(restored.shapes,geometry.shapes);
  assert.deepEqual(errors,[]);console.log('OK: rectangle closure, Shift square, circle radius, 3-point arc, degenerate arc rejection, Escape, persistence.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
