const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
async function method(page,type,name){await page.locator(`[data-tool-menu=${type}-method-menu]`).click();await page.locator(`[data-${type}-method=${name}]`).click();}
test('E2E: ribbon exposes labelled task panels and circle variants draw diameter and three-point circles',async()=>{
 const browser=await launch();try{await session(browser,async({page,click,read})=>{
  for(const name of ['Rysuj','Modyfikuj','Wymiary','Wiązania','Precyzja'])assert.equal(await page.locator('.ribbon-panel').filter({has:page.locator('.ribbon-panel-title',{hasText:name})}).count(),1,name);
  const line=page.locator('#plan-line span');assert.ok(await line.isVisible(),'Tool names remain visible');
  await page.locator('[data-tool-menu=circle-method-menu]').click();await page.locator('[data-circle-method=two]').click();await click(250,450);await click(450,450);
  let g=await read();near(g.shapes[0].center.x,350);near(g.shapes[0].radius,100);
  await page.locator('[data-tool-menu=circle-method-menu]').click();await page.locator('[data-circle-method=three]').click();for(const p of [[550,450],[650,350],[750,450]])await click(...p);
  g=await read();near(g.shapes[1].center.x,650);near(g.shapes[1].center.y,450);near(g.shapes[1].radius,100);
  await page.keyboard.press('Escape');await page.keyboard.press('Control+z');assert.equal((await read()).shapes.length,1);await page.keyboard.press('Control+y');assert.equal((await read()).shapes.length,2);
 });}finally{await browser.close();}
});

test('E2E: center-radius and center-diameter circles accept exact numeric input, preview and Escape',async()=>{
 const browser=await launch();try{await session(browser,async({page,click,read})=>{
  await method(page,'circle','radius');await click(300,450);await page.locator('#sketch-input-value').fill('80');await page.locator('#sketch-input-value').press('Enter');let g=await read();near(g.shapes[0].radius,80);
  await method(page,'circle','diameter');await click(650,450);await page.locator('#sketch-input-value').fill('120');await page.locator('#sketch-input-value').press('Enter');g=await read();near(g.shapes[1].radius,60);
  await click(450,600);await page.locator('#sketch-input-value').fill('90');await page.locator('#sketch-input-value').press('Escape');assert.equal((await read()).shapes.length,2);assert.ok(await page.locator('#sketch-input').isHidden());
 });}finally{await browser.close();}
});
test('E2E: arc flyouts support start-center-end, radius and signed angle entry',async()=>{
 const browser=await launch();try{await session(browser,async({page,click,read})=>{
  await method(page,'arc','startCenter');for(const point of [[400,450],[300,450],[300,350]])await click(...point);
  let g=await read();near(g.shapes[0].a.x,400);near(g.shapes[0].b.x,300);near(g.shapes[0].b.y,350);
  await method(page,'arc','radius');await click(500,550);await click(700,550);await page.locator('#sketch-input-value').fill('150');await page.locator('#sketch-input-value').press('Enter');
  g=await read();const r=await page.evaluate(shape=>PlanTrimming.arc(shape.a,shape.via,shape.b).radius,g.shapes[1]);near(r,150);
  await method(page,'arc','angle');await click(750,350);await click(850,350);await page.locator('#sketch-input-value').fill('-90');await page.locator('#sketch-input-value').press('Enter');g=await read();near(g.shapes[2].b.x,750);near(g.shapes[2].b.y,250);
 });}finally{await browser.close();}
});
test('E2E: tangent arc starts on an existing endpoint and stores its tangent relationship',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,click,read})=>{
  await draw('line',[[200,450],[400,450]]);await method(page,'arc','tangent');await click(400,450);await click(500,550);const g=await read();assert.equal(g.shapes.length,1);assert.equal(g.shapes[0].a.nodeId,g.lines[0].b.nodeId);assert.ok(g.relations.some(r=>r.type==='tangent'&&r.objects.includes(g.shapes[0].id)));
  const result=await page.evaluate(a=>PlanTrimming.arc(a.a,a.via,a.b),g.shapes[0]);near(result.cx,400);near(result.cy,550);near(result.radius,100);
 });}finally{await browser.close();}
});
test('E2E: tangent circles use two lines with radius or three selected lines',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,click,read})=>{
  await page.locator('#plan-precision').click();await page.locator('#precision-menu [name=gridSnap]').check();await page.keyboard.press('Escape');
  await draw('line',[[200,300],[800,300]]);await draw('line',[[200,600],[800,600]]);await draw('line',[[700,300],[700,600]]);
  await method(page,'circle','ttr');await click(400,300);await click(400,600);await page.locator('#sketch-input-value').fill('150');await page.locator('#sketch-input-value').press('Enter');let g=await read();assert.ok(g.shapes.length,JSON.stringify(g.lines));near(g.shapes[0].radius,150);near(g.shapes[0].center.y,450);
  await method(page,'circle','tangent3');await click(550,300);await click(550,600);await click(700,450);g=await read();assert.equal(g.shapes.length,2);near(g.shapes[1].radius,150);near(g.shapes[1].center.x,550);near(g.shapes[1].center.y,450);
 });}finally{await browser.close();}
});
