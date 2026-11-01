const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const {clickXY}=require('./orbit-test-helpers.cjs');

test('E2E: saved constrained arc region can be selected and extruded through the modeling tools',async()=>{
  const browser=await launch();try{await session(browser,async({page,read})=>{
    const fixture=require('./fixtures/point-on-arc-region.json');
    // Restore a saved drawing as input; selection and modeling use real UI actions.
    await page.evaluate(geometry=>new Promise((resolve,reject)=>{
      const r=indexedDB.open('exhibition-planner-v2',1);r.onerror=()=>reject(r.error);
      r.onsuccess=()=>{const db=r.result,tx=db.transaction('library','readwrite'),store=tx.objectStore('library'),q=store.get('plan');
        q.onsuccess=()=>{const data=q.result;data.plans.find(p=>p.id===data.active).outline={...geometry,width:1000,height:700,extrusions:[]};store.put(data,'plan');};
        tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
      };
    }),fixture);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
    if(await page.locator('#plan-view').isHidden())await page.locator('#plan-view-button').click();
    await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    const points=fixture.lines.flatMap(l=>[l.a,l.b]).concat(fixture.shapes.flatMap(s=>[s.a,s.via,s.b]));
    const bounds={minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
    await clickXY(page,0,450,false,bounds);
    await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').press('Enter');
    const g=await read();assert.equal(g.extrusions.length,1);assert.ok(g.extrusions[0].faceIds.some(id=>id.includes(fixture.shapes[0].id)));near(g.extrusions[0].height,1);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).extrusions,g.extrusions);
  });}finally{await browser.close();}
});
test('E2E: a real circle keeps one curve boundary and its extrusion after a radial edit, undo and reload',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,click,read})=>{
    await draw('circle',[[450,475],[600,475]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    await clickXY(page,450,475,false,{minX:300,minY:325,maxX:600,maxY:625});
    await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').press('Enter');
    const before=await read(),faceId=before.extrusions[0].faceIds[0];
    const verify=async()=>{const g=await read();return page.evaluate(g=>{const faces=PlanFaces.detect(g);return{count:faces.length,id:faces[0].id,edges:faces[0].outer.length,area:faces[0].area,sides:PlanExtrusions.surfaces(faces,1).map(s=>s.kind)};},g);};
    let data=await verify();assert.equal(data.count,1);assert.equal(data.edges,1);near(data.area,Math.PI*before.shapes[0].radius**2);assert.deepEqual(data.sides,['plane','plane','cylinder']);
    await require('./cad-test-helpers.cjs').toggleView(page);await click(600,475);
    const r=await page.locator('#plan-surface').boundingBox();await page.mouse.move(r.x+r.width*.6,r.y+r.height*475/700);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*475/700,{steps:5});await page.mouse.up();
    const edited=await read();assert.ok(edited.shapes[0].radius>before.shapes[0].radius);assert.equal(edited.extrusions[0].faceIds[0],faceId);data=await verify();assert.equal(data.id,faceId);near(data.area,Math.PI*edited.shapes[0].radius**2);
    await page.keyboard.press('Control+z');near((await read()).shapes[0].radius,before.shapes[0].radius);await page.keyboard.press('Control+y');near((await read()).shapes[0].radius,edited.shapes[0].radius);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).extrusions,edited.extrusions);assert.equal((await verify()).id,faceId);
  });}finally{await browser.close();}
});
