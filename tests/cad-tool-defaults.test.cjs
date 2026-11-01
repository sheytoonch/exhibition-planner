const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});
for(const method of ['three','ends','center','bezier'])test(`Arc repeats ${method}, including after reload`,()=>session(browser,async({page,draw,click,read})=>{
  const points=method==='three'?[[200,500],[300,400],[400,500]]:method==='center'?[[300,500],[200,500],[300,400]]:[[200,500],[400,500],[300,400]];
  await draw(method,points);const original=(await read()).shapes[0];
  await page.locator('[data-plan-shape=circle]').click();await page.keyboard.press('Escape');
  await page.locator('[data-plan-shape=arc]').click();
  assert.equal(await page.locator('#arc-method-menu').isVisible(),false);
  for(const [x,y]of points)await click(x+400,y);
  let g=await read();assert.equal(g.shapes.length,2);assert.equal(g.shapes[1].type,original.type);
  for(const key of ['a','via','b']){near(g.shapes[1][key].x,original[key].x+400);near(g.shapes[1][key].y,original[key].y);}
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
  assert.equal(await page.locator(`[data-arc-method=${method}]`).getAttribute('aria-pressed'),'true');
  await page.locator('[data-plan-shape=arc]').click();assert.equal(await page.locator('#arc-method-menu').isVisible(),false);
  assert.equal(await page.locator('#plan-lines').evaluate(e=>getComputedStyle(e).cursor),'crosshair');
}));
test('Main line button repeats polyline; arrow changes it back to line',()=>session(browser,async({page,draw,click,read})=>{
  await draw('polyline',[[200,400],[300,400],[300,500]]);
  await page.locator('#plan-line').click();await click(600,400);await click(700,400);await click(700,500);await page.keyboard.press('Enter');
  const g=await read();assert.equal(g.lines.length,4);assert.ok(g.lines[2].polylineId);assert.equal(g.lines[2].polylineId,g.lines[3].polylineId);
  await page.locator('[data-tool-menu=line-method-menu]').click();await page.locator('[data-line-method=line]').click();await page.keyboard.press('Escape');
  await page.locator('#plan-line').click();assert.equal(await page.locator('[data-line-method=line]').getAttribute('aria-pressed'),'true');
}));
test('Main dimension button repeats point-horizontal mode after switching tools',()=>session(browser,async({page,draw,mode,click,read})=>{
  await draw('line',[[200,400],[400,450]]);await mode('pointHorizontal');await page.keyboard.press('Escape');
  await page.locator('[data-plan-measure=length]').click();
  assert.equal(await page.locator('#dimension-method-menu').isVisible(),false);
  await click(200,400);await click(400,450);assert.equal((await read()).dimensions[0].type,'pointHorizontal');
}));
