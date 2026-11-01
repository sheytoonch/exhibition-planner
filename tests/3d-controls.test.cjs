const {renderValues}=require('./render-values.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch}=require('./cad-test-helpers.cjs');

test('E2E: perspective depth precision stays stable while zooming the same model',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[300,350],[600,550]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#orbit-projection').selectOption('perspective');
  const depth=async()=>{const matrix=JSON.parse((await renderValues(page.locator('#plan-orbit'))).toString()).matrix;const project=p=>{const q=[0,0,0,0];for(let row=0;row<4;row++)for(let col=0;col<4;col++)q[row]+=matrix[col*4+row]*p[col];return q[2]/q[3];};return[[350,400,0,1],[550,500,0,1],[400,450,20,1]].map(project);};
  const before=await depth();for(let i=0;i<8;i++)await page.locator('#plan-zoom-in').click();const after=await depth();
  for(let i=0;i<before.length;i++){assert.ok(before[i]>-1&&before[i]<1);assert.ok(Math.abs(after[i]-before[i])<1e-5,'Changing image scale must not collapse or shift the depth range');}
 });}finally{await browser.close();}
});

test('E2E: perspective is directly available in 3D without opening camera settings and persists after reload',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('rectangle',[[300,350],[600,550]]);const geometry=await read();await require('./cad-test-helpers.cjs').toggleView(page);
  assert.ok(await page.locator('#camera-settings').isHidden());assert.ok(await page.locator('#orbit-projection').isVisible());
  const before=await renderValues(page.locator('#plan-orbit'));await page.locator('#orbit-projection').selectOption('perspective');const after=await renderValues(page.locator('#plan-orbit'));assert.ok(!before.equals(after));assert.deepEqual(await read(),geometry);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.equal(await page.locator('#orbit-projection').inputValue(),'perspective');assert.ok(await page.locator('#orbit-projection').isVisible());
  await page.locator('#orbit-projection').selectOption('axonometric');assert.equal(await page.locator('#orbit-projection').inputValue(),'axonometric');
 });}finally{await browser.close();}
});
test('E2E: curve detail follows zoom while rotation preserves geometry and GPU buffers',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('circle',[[450,450],[600,450]]);const model=await read();await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await frame();const before=await page.evaluate(()=>({...Plan3DStats}));
  for(let i=0;i<9;i++)await page.locator('#plan-zoom-in').click();await frame();const zoomed=await page.evaluate(()=>({...Plan3DStats}));assert.ok(zoomed.triangles>before.triangles,'Zoom refines the display mesh');
  const box=await page.locator('#plan-orbit').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7,{steps:15});await page.mouse.up();await frame();
  const rotated=await page.evaluate(()=>({...Plan3DStats}));assert.equal(rotated.uploads,zoomed.uploads);assert.equal(rotated.sceneBuilds,zoomed.sceneBuilds);assert.deepEqual(await read(),model);
 });}finally{await browser.close();}
});
test('E2E: 3D zoom is visible, changes the image, survives rotation and leaves the 2D camera unchanged',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[300,350],[600,550]]);await page.mouse.move(0,0);
    const geometry=await read(),twoD=await page.locator('#plan-surface').boundingBox();
    await require('./cad-test-helpers.cjs').toggleView(page);
    assert.ok(await page.locator('#plan-zoom-in').isVisible(),'3D has zoom controls');
    for(const id of ['plan-orbit-toggle','plan-faces','plan-extrude'])assert.equal(await page.locator(`#${id} svg`).count(),1,`${id} uses an icon`);
    const canvas=page.locator('#plan-orbit');assert.equal(await canvas.evaluate(el=>getComputedStyle(el).cursor),'move');await canvas.focus();await page.keyboard.down('Space');assert.equal(await canvas.evaluate(el=>getComputedStyle(el).cursor),'grab');await page.keyboard.up('Space');assert.equal(await canvas.evaluate(el=>getComputedStyle(el).cursor),'move');const initial=await renderValues(canvas);await page.locator('#plan-zoom-in').click();await page.mouse.move(0,0);
    assert.ok(!(await renderValues(canvas)).equals(initial));const zoom=await page.locator('#plan-zoom-label').textContent();
    const r=await canvas.boundingBox();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width*.55,r.y+r.height*.65,{steps:4});await page.mouse.up();
    assert.equal(await page.locator('#plan-zoom-label').textContent(),zoom,'Rotation keeps zoom');
    const beforePan=await renderValues(canvas);await page.mouse.down({button:'middle'});assert.equal(await canvas.evaluate(el=>getComputedStyle(el).cursor),'grabbing');await page.mouse.move(r.x+r.width*.6,r.y+r.height*.7,{steps:3});await page.mouse.up({button:'middle'});
    assert.ok(!(await renderValues(canvas)).equals(beforePan),'Middle drag pans 3D');assert.equal(await page.locator('#plan-zoom-label').textContent(),zoom);
    await page.mouse.wheel(0,-100);assert.notEqual(await page.locator('#plan-zoom-label').textContent(),zoom,'Wheel controls 3D camera');
    await page.locator('#plan-zoom-reset').click();assert.equal(await page.locator('#plan-zoom-label').textContent(),'100%');
    await require('./cad-test-helpers.cjs').toggleView(page);assert.deepEqual(await page.locator('#plan-surface').boundingBox(),twoD);assert.deepEqual(await read(),geometry);
  });}finally{await browser.close();}
});
