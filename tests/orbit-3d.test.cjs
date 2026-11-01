const {renderValues}=require('./render-values.cjs');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.O=PlanOrbit;',scope);
test('Unit: 3D rotation preserves distances and source coordinates',()=>{
  const p={x:3,y:4},before={...p};for(const yaw of [0,.5,Math.PI])for(const pitch of [0,.7,-1]){const rotated=scope.O.rotate(p,yaw,pitch);near(Math.hypot(rotated.x,rotated.y,rotated.z),5);assert.deepEqual(p,before);}
  const quarter=scope.O.rotate({x:1,y:0},Math.PI/2,Math.PI/3);near(quarter.x,0);near(quarter.y,.5);near(quarter.z,Math.sqrt(3)/2);
});
test('Unit: dragging crosses both poles and permits repeated full rotations',()=>{
  const start={yaw:.2,pitch:Math.PI/2};for(const delta of [1,-1,Math.PI,2*Math.PI,8*Math.PI+.4]){const camera=scope.O.drag(start,delta*100,delta*100),actual=scope.O.rotate({x:2,y:3,z:4},camera.yaw,camera.pitch),expected=scope.O.rotate({x:2,y:3,z:4},start.yaw+delta,start.pitch+delta);for(const axis of ['x','y','z'])near(actual[axis],expected[axis]);}
});
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});

test('E2E: reload restores 3D camera and remembers returning to 2D',()=>session(browser,async({page,draw,read})=>{
  await draw('rectangle',[[250,350],[650,600]]);const model=await read();
  await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('[data-orbit-plane="xz"]').press('Enter');
  await page.locator('#plan-zoom-in').click();
  await renderValues(page.locator('#plan-orbit'));
  const camera=()=>page.evaluate(()=>({axes:['x','y','z'].map(axis=>{const line=document.querySelector(`#orbit-axis-${axis}`);return[line.getAttribute('x2'),line.getAttribute('y2')];}),zoom:document.querySelector('#plan-zoom-label').textContent}));
  const before=await camera();assert.equal(before.zoom,'140%');
  const reload=async()=>{await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);};
  await reload();assert.ok(await page.locator('#plan-orbit').isVisible());assert.equal(await page.locator('#plan-orbit-toggle').getAttribute('aria-pressed'),'true');
  await renderValues(page.locator('#plan-orbit'));assert.deepEqual(await camera(),before);assert.deepEqual(await read(),model);
  await require('./cad-test-helpers.cjs').toggleView(page);await reload();assert.ok(await page.locator('#plan-orbit').isHidden());assert.equal(await page.locator('#plan-orbit-toggle').getAttribute('aria-pressed'),'false');assert.deepEqual(await read(),model);
}));
test('E2E: keep rotating vertically through edge-on views, beyond 360 degrees, in both directions',()=>session(browser,async({page,draw,read})=>{
  await draw('line',[[200,400],[500,450]]);await draw('three',[[500,450],[600,350],[700,450]]);const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#orbit-gizmo').getByRole('button',{name:'Ustaw widok XZ',exact:true}).press('Enter');
  const canvas=page.locator('#plan-orbit'),box=await canvas.boundingBox(),edgeImage=await renderValues(canvas);let pitch=Math.PI/2;
  for(const dy of [100,200,200,200,200,-200,-200,-200,-200,-200]){const x=box.x+box.width*.5,y=box.y+box.height*.55;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+dy,{steps:10});await page.mouse.up();pitch+=dy*.01;near(Number(await page.locator('#orbit-axis-z').getAttribute('y2')),76-49.5*Math.sin(pitch));assert.deepEqual(await read(),before);}
  assert.notDeepEqual(await renderValues(canvas),edgeImage,'Rotation must continue beyond the edge-on orientation');await require('./cad-test-helpers.cjs').toggleView(page);assert.deepEqual(await read(),before);
}));
test('E2E: toggle 3D, rotate with pointer, return to unchanged 2D without adding any 3D objects',()=>session(browser,async({page,draw,read})=>{
  await draw('line',[[200,400],[500,450]]);await draw('three',[[500,450],[600,350],[700,450]]);
  const before=await read(),bounds=await page.locator('#plan-surface').boundingBox();await require('./cad-test-helpers.cjs').toggleView(page);const canvas=page.locator('#plan-orbit');assert.ok(await canvas.isVisible());assert.ok(await page.locator('#plan-lines').isHidden());
  const imageBefore=await renderValues(canvas),box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.7,{steps:12});await page.mouse.up();
  assert.notDeepEqual(await renderValues(canvas),imageBefore,'Pointer rotates rendered geometry');assert.deepEqual(await read(),before,'Rotation changes neither geometry nor saved model');
  await require('./cad-test-helpers.cjs').toggleView(page);assert.ok(await canvas.isHidden());assert.ok(await page.locator('#plan-lines').isVisible());assert.deepEqual(await page.locator('#plan-surface').boundingBox(),bounds);assert.deepEqual(await read(),before);
  await page.keyboard.press('Control+z');assert.equal((await read()).shapes.length,0);assert.equal((await read()).lines.length,1);await page.keyboard.press('Control+y');assert.deepEqual(await read(),before,'View rotation adds no geometry history entries');
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual(await read(),before);
}));
