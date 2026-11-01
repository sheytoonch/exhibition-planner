const {renderValues}=require('./render-values.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const {clickXY}=require('./orbit-test-helpers.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),scope={structuredClone};
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.E=PlanExtrusions;this.F=PlanFaces;',scope);
const plain=value=>JSON.parse(JSON.stringify(value));

test('Unit: old projects recover split circle extrusions without stored region snapshots',()=>{
 const g={planeId:'xy',lines:[],shapes:[{id:'round',type:'circle',center:{x:0,y:0},radius:10}]},original=scope.F.detect(g)[0];g.extrusions=[{id:'solid',height:1.25,faceIds:[original.id]}];
 g.lines.push({id:'diameter',a:{x:-10,y:0},b:{x:10,y:0}});assert.equal(scope.E.reconcile(g),true);
 assert.equal(g.extrusions[0].faceIds.length,2);assert.equal(g.extrusions[0].regions.length,2);assert.equal(g.extrusions[0].height,1.25);assert.equal(g.extrusions[0].id,'solid');assert.equal(scope.E.reconcile(g),false,'Reconciliation is stable and repeatable');
});
test('Unit: refresh recovers an older semicircle after moving a line even when its saved contour orientation is reversed',()=>{
 const g={planeId:'xy',lines:[{id:'a-chord',a:{x:-10,y:0},b:{x:10,y:0}},{id:'moving',a:{x:-15,y:-15},b:{x:-15,y:5}}],shapes:[{id:'z-arc',type:'arc',a:{x:-10,y:0},via:{x:0,y:-10},b:{x:10,y:0}}]},face=scope.F.detect(g)[0];
 g.extrusions=[{id:'saved-solid',height:.75,faceIds:[face.id],regions:[]}];g.lines[1].a.x=0;g.lines[1].b.x=0;
 scope.E.reconcile(g);const faces=scope.F.detect(g);assert.equal(faces.length,2);assert.equal(g.extrusions[0].faceIds.filter(id=>faces.some(f=>f.id===id)).length,2,'Both parts recover from existing source edges on refresh');assert.equal(g.extrusions[0].height,.75);assert.equal(scope.E.reconcile(g),false);
});
test('E2E: opening an older project recovers a semicircle lost after a moved line and persists the repair',async()=>{
 const browser=await launch();try{await session(browser,async({page,read})=>{
  // Historical input fixture: the user has already moved the line and saved,
  // and the earlier application left the original extrusion id unresolved.
  await page.evaluate(async()=>{
   const geometry={width:1000,height:700,planeId:'xy',metersPerUnit:.01,lines:[{id:'a-chord',a:{x:250,y:500},b:{x:450,y:500}},{id:'moving',a:{x:350,y:350},b:{x:350,y:550}}],shapes:[{id:'z-arc',type:'arc',a:{x:250,y:500},via:{x:350,y:400},b:{x:450,y:500}}],extrusions:[{id:'saved-solid',height:1.5,faceIds:['face:xy:a-chord#0+|z-arc#0-'],regions:[]}]};
   await new Promise((resolve,reject)=>{const request=indexedDB.open('exhibition-planner-v2',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('library','readwrite'),store=tx.objectStore('library'),get=store.get('plan');get.onsuccess=()=>{const data=get.result;data.plans.find(p=>p.id===data.active).outline=geometry;store.put(data,'plan');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  });
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
  await page.evaluate(()=>{const build=PlanMesh.build;PlanMesh.build=function(scene){const mesh=build(scene);window.recoveredMesh=mesh;return mesh;};});
  await require('./cad-test-helpers.cjs').toggleView(page);await page.waitForFunction(()=>window.recoveredMesh?.triangles.some(t=>t.role===1.1));
  const saved=await read();assert.equal(saved.extrusions[0].height,1.5);assert.equal(saved.extrusions[0].faceIds.length,2);assert.equal(saved.extrusions[0].regions.length,2);
  assert.equal(await page.evaluate(ids=>ids.every(id=>recoveredMesh.triangles.some(t=>recoveredMesh.faceIds[t.face]===id&&t.role===1&&Math.abs(t.a.height-150)<1e-6)),saved.extrusions[0].faceIds),true,'Both recovered halves are rendered as solids');
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).extrusions,saved.extrusions);
 });}finally{await browser.close();}
});
test('Unit: topology changes preserve unrelated groups and do not assign conflicting heights to a merged face',()=>{
 const g={planeId:'xy',lines:[{id:'split',a:{x:0,y:-10},b:{x:0,y:10}}],shapes:[{id:'box',type:'rectangle',a:{x:-10,y:-10},b:{x:10,y:10}}]},faces=scope.F.detect(g);assert.equal(faces.length,2);
 g.extrusions=faces.map((face,i)=>({id:`group${i}`,height:i+1,faceIds:[face.id]}));scope.E.reconcile(g);const before=structuredClone(g),ids=plain(g.extrusions.map(group=>group.faceIds));g.lines=[];
 scope.E.reconcile(g,before);assert.deepEqual(plain(g.extrusions.map(group=>group.faceIds)),ids,'Ambiguous merges do not silently choose a height');assert.ok(g.extrusions.every(group=>group.regions.length===1),'Original regions stay available');
});
test('Unit: replacing an object inside its former footprint does not inherit an unrelated extrusion',()=>{
 const g={planeId:'xy',lines:[],shapes:[{id:'original',type:'circle',center:{x:0,y:0},radius:10}]};g.extrusions=[{id:'solid',height:2,faceIds:[scope.F.detect(g)[0].id]}];scope.E.reconcile(g);const before=structuredClone(g),id=g.extrusions[0].faceIds[0];
 g.shapes=[{id:'unrelated',type:'circle',center:{x:0,y:0},radius:3}];scope.E.reconcile(g,before);assert.equal(g.extrusions[0].faceIds[0],id);assert.notEqual(g.extrusions[0].faceIds[0],scope.F.detect(g)[0].id);
});

test('E2E: editing a 2D outline preserves existing solids when an extruded circle is split',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('circle',[[350,450],[425,450]]);await draw('rectangle',[[550,350],[750,550]]);
  const bounds={minX:275,minY:350,maxX:750,maxY:550};
  await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
  for(const [x,height]of [[350,'100'],[650,'200']]){await clickXY(page,x,450,false,bounds);await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill(height);await page.locator('#extrude-height').press('Enter');await page.keyboard.press('Escape');}
  const original=await read(),circleGroup=original.extrusions.find(g=>g.height===1),wallGroup=original.extrusions.find(g=>g.height===2);assert.ok(circleGroup&&wallGroup);
  await page.evaluate(()=>{const build=PlanMesh.build;PlanMesh.build=function(scene){const mesh=build(scene);window.editedExtrusionMesh=mesh;return mesh;};});
  await require('./cad-test-helpers.cjs').toggleView(page);await draw('line',[[275,450],[425,450]]);
  const edited=await read(),group=edited.extrusions.find(g=>g.id===circleGroup.id);assert.equal(group.faceIds.length,2,'Both halves retain the original extrusion');assert.equal(group.height,1);assert.equal(edited.extrusions.find(g=>g.id===wallGroup.id).height,2);
  await require('./cad-test-helpers.cjs').toggleView(page);
  await page.waitForFunction(()=>window.editedExtrusionMesh?.triangles.some(t=>t.role===1.1));
  const rendered=await page.evaluate(g=>{const mesh=editedExtrusionMesh;return g.extrusions.every(group=>group.faceIds.every(id=>mesh.triangles.some(t=>mesh.faceIds[t.face]===id&&t.role===1&&Math.abs((t.a.height||0)-group.height/g.metersPerUnit)<1e-6)))&&document.querySelector('#plan-orbit').getContext('webgl2').getError()===0;},edited);
  assert.equal(rendered,true,'Every retained region is rendered as a solid at its original height');
  const attached=await page.evaluate(g=>{const faces=PlanFaces.detect(g);return g.extrusions.map(group=>({height:group.height,count:faces.filter(f=>group.faceIds.includes(f.id)).length}));},edited);
  assert.deepEqual(attached.sort((a,b)=>a.height-b.height),[{height:1,count:2},{height:2,count:1}]);
  await page.keyboard.press('Control+z');assert.deepEqual((await read()).extrusions,original.extrusions);await page.keyboard.press('Control+y');assert.deepEqual((await read()).extrusions,edited.extrusions);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).extrusions,edited.extrusions);
 });}finally{await browser.close();}
});
test('E2E: clicking outside closes extrusion and preserves its current height and history',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[200,350],[600,600]]);const before=await read();
    await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    const select=()=>clickXY(page,400,475,false,{minX:200,minY:350,maxX:600,maxY:600});
    const outside=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));const r=await page.locator('#plan-orbit').boundingBox();await page.mouse.click(r.x+10,r.y+r.height/2);await page.locator('#extrude-controls').waitFor({state:'hidden'});};
    await select();await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await outside();
    assert.ok(await page.locator('#extrude-controls').isHidden());near((await read()).extrusions[0].height,1);
    await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);await page.keyboard.press('Control+y');near((await read()).extrusions[0].height,1);
    await select();await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('50');await page.locator('#extrude-height').press('Enter');const confirmed=await read();
    await select();await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('-75');await outside();
    near((await read()).extrusions[0].height,-.75);await page.keyboard.press('Control+z');assert.deepEqual(await read(),confirmed);
    await page.keyboard.press('Control+y');const retained=await read();await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual(await read(),retained);
  });}finally{await browser.close();}
});
test('Unit: changing membership restores removed faces, preserves other groups and supports zero or negative height',()=>{
  const before=[{id:'old',faceIds:['a','b'],height:2},{id:'other',faceIds:['c'],height:3}],copy=structuredClone(before);
  assert.deepEqual(plain(scope.E.preview(before,['b','c'],1,'active')),[{id:'old',faceIds:['a'],height:2},{id:'active',faceIds:['b','c'],height:1}]);
  assert.deepEqual(plain(scope.E.preview(before,['a','c'],0,'active')),[{id:'old',faceIds:['b'],height:2},{id:'active',faceIds:['a','c'],height:0}]);
  assert.deepEqual(plain(scope.E.preview(before,[],-1,'active')),before);assert.deepEqual(before,copy);assert.throws(()=>scope.E.preview(before,['a'],NaN,'active'));
});
test('Unit: combined adjacent faces have no internal wall; selecting a hole removes its boundary',()=>{
  const point=(x,y)=>({x,y}),face=(id,points,holes=[])=>({id,points,holes});
  const left=face('left',[point(0,0),point(1,0),point(1,1),point(0,1)]),right=face('right',[point(1,0),point(2,0),point(2,1),point(1,1)]);
  const edges=scope.E.boundary([left,right]);assert.equal(edges.length,6);assert.ok(!edges.some(e=>e.a.x===1&&e.b.x===1));
  const hole=[point(.2,.2),point(.8,.2),point(.8,.8),point(.2,.8)];left.holes=[hole];assert.equal(scope.E.boundary([left]).length,8);assert.equal(scope.E.boundary([left,face('hole',hole)]).length,4);
});
test('E2E: surfaces belong to 3D; Ctrl changes the active extrusion group without restarting',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[200,350],[600,600]]);await draw('line',[[400,350],[400,600]]);await draw('rectangle',[[650,400],[800,550]]);
    const before=await read();assert.ok(await page.locator('#plan-faces').isHidden(),'Surface tool is available only in 3D');
    await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    await clickXY(page,300,475);await clickXY(page,500,475,true);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'2');
    await page.locator('#plan-extrude').click();const height=page.locator('#extrude-height');
    await page.locator('#orbit-gizmo-default').press('Enter');const flat=await renderValues(page.locator('#plan-orbit'));
    assert.equal(await page.locator('#extrude-apply,#extrude-cancel').count(),0);await height.fill('100');await height.dispatchEvent('input');near((await read()).extrusions[0].height,1,'Height saves without confirmation');assert.ok(!(await renderValues(page.locator('#plan-orbit'))).equals(flat),'Height renders a volume rather than a flat surface');
    await clickXY(page,725,475,true);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'3');assert.equal(await height.inputValue(),'100');
    await clickXY(page,300,475,true);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'2');assert.ok(await page.locator('#extrude-controls').isVisible());
    await height.fill('150');await height.dispatchEvent('input');await page.keyboard.press('Escape');
    const g=await read();assert.equal(g.extrusions.length,1);assert.equal(g.extrusions[0].faceIds.length,2);near(g.extrusions[0].height,1.5);assert.deepEqual(g.lines,before.lines);
    await page.locator('#orbit-gizmo-default').press('Enter');assert.ok(await page.locator('#plan-orbit').isVisible());
    await page.keyboard.press('Control+z');assert.equal((await read()).extrusions?.length||0,0);await page.keyboard.press('Control+y');assert.deepEqual((await read()).extrusions,g.extrusions);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).extrusions,g.extrusions);
  });}finally{await browser.close();}
});
test('E2E: drag commits immediately, Escape keeps the result, undo restores and negative height, revise an existing group and restore zero thickness',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[200,350],[600,600]]);const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    const select=()=>clickXY(page,400,475,false,{minX:200,minY:350,maxX:600,maxY:600});await select();await page.locator('#plan-extrude').click();await page.locator('#orbit-gizmo-default').press('Enter');
    const handle=page.locator('#extrude-handle'),r=await handle.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2-70,{steps:8});await page.mouse.up();assert.ok(Number(await page.locator('#extrude-height').inputValue())>0);
    const dragged=await read();assert.ok(dragged.extrusions[0].height>0,'Release saves the drag');await page.keyboard.press('Escape');assert.deepEqual(await read(),dragged,'Escape preserves the completed operation');await page.keyboard.press('Control+z');assert.deepEqual(await read(),before,'Undo restores the state before the drag');
    await select();await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('-50');await page.locator('#extrude-height').dispatchEvent('input');await page.keyboard.press('Escape');near((await read()).extrusions[0].height,-.5);
    await select();await page.locator('#plan-extrude').click();assert.equal(await page.locator('#extrude-height').inputValue(),'-50');await page.locator('#extrude-height').fill('0');await page.locator('#extrude-height').press('Enter');near((await read()).extrusions[0].height,0);assert.equal((await read()).extrusions.length,1);assert.deepEqual((await read()).lines,before.lines);
  });}finally{await browser.close();}
});
