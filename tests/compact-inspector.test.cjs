const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});

test('Canvas dimension: click selects the dimension, drag offsets it, Delete removes it without deleting geometry',()=>session(browser,async({page,draw,click,read,mode})=>{
  await page.evaluate(()=>{window.labels=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){const rect=this.canvas.getBoundingClientRect(),point=new DOMPoint(x,y).matrixTransform(this.getTransform()),scale=this.canvas.width/rect.width;window.labels.push({text:String(text),x:rect.x+point.x/scale,y:rect.y+point.y/scale});return original.call(this,text,x,y,...args);};});
  await draw('line',[[300,450],[600,450]]);await mode('aligned');await click(450,450);await page.locator('#plan-select').click();
  const before=await read(),label=await page.evaluate(()=>window.labels.filter(label=>label.text==='300').at(-1));assert.ok(label);
  await page.mouse.click(label.x,label.y);
  await page.mouse.move(label.x,label.y);await page.mouse.down();await page.mouse.move(label.x,label.y+90,{steps:6});await page.mouse.up();
  const moved=await read();assert.ok(moved.lines[0].dimensionOffset!==undefined);assert.deepEqual(moved.lines[0].a,before.lines[0].a);assert.deepEqual(moved.lines[0].b,before.lines[0].b);
  await page.keyboard.press('Delete');const removed=await read();assert.equal(removed.lines.length,1);assert.equal(removed.lines[0].showLength,false);assert.deepEqual(removed.lines[0].a,before.lines[0].a);assert.deepEqual(removed.lines[0].b,before.lines[0].b);
  await page.keyboard.press('Control+z');assert.equal((await read()).lines[0].showLength,true);
  const latest=await page.evaluate(()=>window.labels.filter(label=>label.text==='300').at(-1));await page.mouse.dblclick(latest.x,latest.y);const input=page.locator('#selection-measurements input');assert.ok(await input.isVisible());await input.fill('280');await input.press('Enter');near((await read()).lines[0].fixedLength,2.8);
}));

test('Free endpoints move independently; drawing, selecting, measuring and unchanged editing create no constraints',()=>session(browser,async({page,draw,click,read,mode})=>{
  page.setDefaultTimeout(5000);
  await page.evaluate(()=>{window.dimensionLabels=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.dimensionLabels.push(String(text));return original.call(this,text,...args);};});
  await draw('line',[[300,450],[600,450]]);await click(450,450);
  assert.ok(await page.locator('#plan-measurements').isHidden());
  assert.deepEqual(await page.evaluate(()=>window.dimensionLabels),[],'No unsolicited dimensions on canvas');
  const drag=async(from,to)=>{const box=await page.locator('#plan-surface').boundingBox();await page.mouse.move(box.x+box.width*from.x/1000,box.y+box.height*from.y/700);await page.mouse.down();await page.mouse.move(box.x+box.width*to.x/1000,box.y+box.height*to.y/700,{steps:8});await page.mouse.up();};
  for(const [key,target] of [['b',{x:700,y:540}],['a',{x:240,y:570}],['b',{x:550,y:350}],['a',{x:380,y:430}]]){
    const before=(await read()).lines[0],other=key==='a'?'b':'a';await drag(before[key],target);const after=(await read()).lines[0];
    near(after[key].x,target.x);near(after[key].y,target.y);assert.deepEqual(after[other],before[other]);assert.ok(!after.fixedLength&&!after.fixedAngle&&!after.showLength);
  }
  const line=(await read()).lines[0];await mode('aligned');await click((line.a.x+line.b.x)/2,(line.a.y+line.b.y)/2);await page.locator('#plan-select').click();await click((line.a.x+line.b.x)/2,(line.a.y+line.b.y)/2);
  const row=page.locator('#plan-measurements .measurement-row').filter({hasText:'Długość'});await row.locator('button').dblclick();await row.locator('input').press('Tab');
  assert.ok(!(await read()).lines[0].fixedLength,'Leaving unchanged value must not fix length');
  const before=(await read()).lines[0];await drag(before.b,{x:650,y:510});const after=(await read()).lines[0];near(after.b.x,650);near(after.b.y,510);assert.deepEqual(after.a,before.a);assert.ok(!after.fixedLength);
  assert.equal((await read()).relations.length,0);assert.equal(await page.locator('#notifications .notification').count(),0);
}));
test('Compact panels: single click selects, double click edits, Delete releases only the selected binding',()=>session(browser,async({page,draw,click,read,mode})=>{
  page.setDefaultTimeout(5000);
  await draw('line',[[300,450],[600,450]]);await click(450,450);
  await mode('aligned');await click(450,450);await page.locator('#plan-select').click();await click(450,450);
  const left=page.locator('#plan-measurements'),right=page.locator('#plan-constraints-panel');
  assert.ok(await left.isVisible());assert.ok(await page.locator('#line-properties').isHidden());
  assert.ok(await page.locator('#plan-import-status').isHidden());
  assert.ok(await page.locator('#plan-save-status').isHidden());
  assert.ok(await page.locator('#plan-selection-actions').isHidden());
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const style=await left.evaluate(element=>{const panel=getComputedStyle(element),button=getComputedStyle(element.querySelector('button'));return{panelBackground:panel.backgroundColor,panelBorder:panel.borderTopWidth,buttonBackground:button.backgroundColor,buttonBorder:button.borderTopWidth};});
    assert.equal(style.panelBackground,'rgba(0, 0, 0, 0)');assert.equal(style.panelBorder,'0px');assert.equal(style.buttonBackground,'rgba(0, 0, 0, 0)');assert.equal(style.buttonBorder,'0px');
  }
  const length=left.locator('.measurement-row').filter({hasText:'Długość'});
  await length.locator('button').dblclick();assert.notEqual(await length.locator('input').inputValue(),'');await length.locator('input').fill('');await length.locator('input').press('Tab');
  assert.equal(await left.locator('input').count(),0);assert.ok(await length.locator('button').isVisible());assert.ok(!(await read()).lines[0].fixedLength);
  const unchanged=await read();
  await length.locator('button').dblclick();await length.locator('input').fill('abc');await length.locator('input').press('Tab');assert.deepEqual((await read()).lines,unchanged.lines);
  await length.locator('button').dblclick();await length.locator('input').fill('999');await length.locator('input').press('Escape');assert.deepEqual((await read()).lines,unchanged.lines);
  await length.locator('button').click();assert.match(await length.locator('button').getAttribute('class'),/detail-selected/);
  assert.equal(await left.locator('input').count(),0);
  await length.locator('button').dblclick();await length.locator('input').fill('250,0');await length.locator('input').press('Enter');
  let g=await read();near(g.lines[0].fixedLength,2.5);near(Math.hypot(g.lines[0].b.x-g.lines[0].a.x,g.lines[0].b.y-g.lines[0].a.y),250);
  await page.locator('[data-tool-menu=binding-method-menu]').click();await page.locator('[data-binding-method=angle]').click();await click(425,450);
  await page.locator('#plane-angle-menu [name=degrees]').fill('10');await page.locator('#plane-angle-menu button[type=submit]').click();await page.locator('#plan-select').click();g=await read();await click((g.lines[0].a.x+g.lines[0].b.x)/2,(g.lines[0].a.y+g.lines[0].b.y)/2);
  const angle=left.locator('.measurement-row').filter({hasText:'Kąt do poziomu'});
  await angle.locator('button').dblclick();await angle.locator('input').fill('30');await angle.locator('input').press('Enter');
  g=await read();near(g.lines[0].fixedAngle.degrees,30);near(g.lines[0].fixedLength,2.5);
  assert.ok(await page.locator('#plan-import-status').isHidden(),'Success messages do not occupy drawing space');
  await right.getByRole('button',{name:/Długość/}).click();assert.equal((await read()).lines[0].fixedLength,2.5);
  await page.keyboard.press('Delete');g=await read();assert.equal(g.lines.length,1);assert.equal(g.lines[0].fixedLength,null);near(g.lines[0].fixedAngle.degrees,30);
  await right.getByRole('button',{name:/Kąt/}).click();await page.keyboard.press('Delete');g=await read();assert.equal(g.lines.length,1);assert.equal(g.lines[0].fixedAngle,null);
  assert.ok(await right.isHidden());
  const l=await left.boundingBox(),r=await page.locator('#plan-board').boundingBox();assert.ok(l.x<r.x+r.width/2);assert.ok(l.height<250);
  const canvasBefore=await page.locator('#plan-surface').boundingBox();
  await page.locator('#selection-more').click();assert.ok(await page.locator('#plan-selection-actions').isVisible());
  await page.keyboard.press('Escape');assert.ok(await page.locator('#plan-selection-actions').isHidden());
  assert.deepEqual(await page.locator('#plan-surface').boundingBox(),canvasBefore);
}));

test('Unmeasured arcs and circles have no automatic dimension labels or radius constraint',()=>session(browser,async({page,draw,click,read})=>{
  await page.evaluate(()=>{window.labels=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.labels.push(String(text));return original.call(this,text,...args);};});
  await draw('three',[[250,500],[350,400],[450,500]]);await click(350,400);assert.ok(await page.locator('#plan-measurements').isHidden());
  await draw('circle',[[650,450],[750,450]]);await click(750,450);assert.ok(await page.locator('#plan-measurements').isHidden());
  const g=await read();assert.equal(g.shapes.length,2);for(const shape of g.shapes){assert.ok(!shape.fixedRadius);assert.ok(!shape.dimensionType);}
  assert.deepEqual(await page.evaluate(()=>window.labels.filter(text=>/\d/.test(text))),[]);
}));

test('Removing a curve continuation also releases its shared endpoint',()=>session(browser,async({page,draw,click,read})=>{
  page.setDefaultTimeout(5000);
  await draw('three',[[200,500],[300,400],[400,500]]);await draw('line',[[600,500],[800,600]]);
  await page.locator('[data-tool-menu=binding-method-menu]').click();await page.locator('[data-relation-type=collinear]').click();await click(400,500);await click(600,500);
  assert.equal((await read()).relations.length,1);
  await page.locator('#plan-constraints-panel').getByRole('button',{name:'Współliniowość'}).click();await page.keyboard.press('Delete');
  const g=await read();assert.equal(g.relations.length,0);assert.equal(g.lines.length,1);assert.equal(g.shapes.length,1);assert.notEqual(g.lines[0].a.nodeId,g.shapes[0].b.nodeId);
}));
