const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});

test('Distinct dimension icons; closing menu and reselecting active mode keep crosshair',()=>session(browser,async({page,mode})=>{
  const icons=await page.locator('[data-dimension-method] svg').evaluateAll(nodes=>nodes.map(n=>n.innerHTML));
  assert.equal(icons.length,14);assert.equal(new Set(icons).size,14);
  await mode('pointHorizontal');
  const main=page.locator('[data-plan-measure=length]');
  assert.equal(await main.locator('svg').innerHTML(),await page.locator('[data-dimension-method=pointHorizontal] svg').innerHTML());
  await page.locator('[data-tool-menu=dimension-method-menu]').click();assert.equal(await page.locator('#dimension-method-menu').isVisible(),true);
  await page.locator('[data-tool-menu=dimension-method-menu]').click();assert.equal(await page.locator('#dimension-method-menu').isVisible(),false);
  assert.equal(await main.getAttribute('aria-pressed'),'true');
  await mode('pointHorizontal');
  assert.equal(await page.locator('#plan-lines').evaluate(e=>getComputedStyle(e).cursor),'crosshair');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#plan-select').getAttribute('aria-pressed'),'true');
}));

test('Point dimension follows endpoint drag, undo/redo and reload',()=>session(browser,async({draw,mode,click,read,page})=>{
  await draw('line',[[200,500],[400,500]]);await draw('three',[[600,500],[700,400],[800,500]]);
  await mode('pointDistance');await click(400,500);await click(600,500);
  const original=await read();assert.equal(original.dimensions.length,1);
  await page.locator('#plan-select').click();await click(300,500);
  const r=await page.locator('#plan-surface').boundingBox();
  await page.mouse.move(r.x+r.width*.4,r.y+r.height*500/700);await page.mouse.down();
  await page.mouse.move(r.x+r.width*.45,r.y+r.height*550/700,{steps:5});await page.mouse.up();
  const moved=await read();near(moved.lines[0].b.x,450);near(moved.lines[0].b.y,550);
  const size=await page.evaluate(g=>{const l=PlanDimensions.line(g,g.dimensions[0]);return Math.hypot(l.b.x-l.a.x,l.b.y-l.a.y);},moved);
  near(size,Math.hypot(150,50));assert.deepEqual(moved.dimensions,original.dimensions);
  await page.keyboard.press('Control+z');near((await read()).lines[0].b.x,400);
  await page.keyboard.press('Control+y');near((await read()).lines[0].b.x,450);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
  assert.deepEqual((await read()).dimensions,original.dimensions);near((await read()).lines[0].b.x,450);
}));

test('Partial arc dimension is rendered, removable and undoable',()=>session(browser,async({draw,mode,click,read,page})=>{
  await draw('three',[[200,500],[300,400],[400,500]]);
  await page.evaluate(()=>{window.labels=[];const native=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){const p=new DOMPoint(x,y).matrixTransform(this.getTransform()),r=this.canvas.getBoundingClientRect(),scale=this.canvas.width/r.width;window.labels.push({text:String(text),x:r.x+p.x/scale,y:r.y+p.y/scale});return native.call(this,text,x,y,...args);};});
  await mode('partialArcLength');await click(200,500);await click(300,400);
  await page.locator('#plan-select').click();
  let label=await page.evaluate(()=>window.labels.filter(l=>l.text==='⌒ 157,1').at(-1));assert.ok(label);
  const before=await read();
  await page.mouse.move(label.x,label.y);await page.mouse.down();await page.mouse.move(label.x-55,label.y-55,{steps:5});await page.mouse.up();
  const shifted=await read();assert.ok(shifted.dimensions[0].dimensionOffset>0);
  assert.deepEqual(shifted.shapes,before.shapes,'Moving arc dimension preserves measured geometry');
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
  near((await read()).dimensions[0].dimensionOffset,shifted.dimensions[0].dimensionOffset);
  // Reinstall text tracing after reload, then trigger a repaint.
  await page.evaluate(()=>{window.labels=[];const native=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){const p=new DOMPoint(x,y).matrixTransform(this.getTransform()),r=this.canvas.getBoundingClientRect(),scale=this.canvas.width/r.width;window.labels.push({text:String(text),x:r.x+p.x/scale,y:r.y+p.y/scale});return native.call(this,text,x,y,...args);};});
  await page.locator('#plan-select').click();
  label=await page.evaluate(()=>window.labels.filter(l=>l.text==='⌒ 157,1').at(-1));assert.ok(label);
  await page.mouse.click(label.x,label.y);assert.equal(await page.locator('#dimension-properties').isVisible(),false);
  await page.keyboard.press('Delete');assert.equal((await read()).dimensions.length,0);
  await page.keyboard.press('Control+z');assert.equal((await read()).dimensions.length,1);
}));
