const {renderValues}=require('./render-values.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const {clickXY}=require('./orbit-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};
vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.F=PlanFaces;this.S=PlanSketch;',scope);
const line=(ax,ay,bx,by)=>({a:{x:ax,y:ay},b:{x:bx,y:by}});
const rectangle=(x,y,w,h)=>[line(x,y,x+w,y),line(x+w,y,x+w,y+h),line(x+w,y+h,x,y+h),line(x,y+h,x,y)];
const geometry=(lines,shapes=[])=>({planeId:'xy',lines,shapes});

test('Unit: the first sketch uses XY; existing geometry and explicit support planes survive normalization',()=>{
  const plan={outline:geometry(rectangle(0,0,10,10))},before=JSON.stringify(plan.outline.lines);scope.S.normalize(plan);
  assert.equal(plan.outline.planeId,'xy');assert.equal(JSON.stringify(plan.outline.lines),before);
  assert.deepEqual(JSON.parse(JSON.stringify(scope.S.world(plan.planes[0],{x:2,y:3}))),{x:2,y:3,z:0});
  plan.planes.push({id:'tilted',origin:{x:1,y:2,z:3},u:{x:1,y:0,z:0},v:{x:0,y:0,z:1}});plan.outline.planeId='tilted';scope.S.normalize(plan);
  assert.equal(plan.outline.planeId,'tilted');assert.deepEqual(JSON.parse(JSON.stringify(scope.S.world(plan.planes[1],{x:2,y:3}))),{x:3,y:2,z:6});
});
test('Unit: shared boundaries, T junctions, crossings and duplicate edges define separate bounded faces',()=>{
  const g=geometry([...rectangle(0,0,10,10),line(5,0,5,10),line(0,5,10,5),line(0,0,10,0)]),before=JSON.stringify(g),faces=scope.F.detect(g);
  assert.equal(faces.length,4);for(const f of faces){near(f.area,25);assert.equal(f.thickness,0);assert.equal(f.planeId,'xy');}assert.equal(JSON.stringify(g),before);
});
test('Unit: nested outlines form independent surfaces and holes without overlapping areas',()=>{
  const faces=scope.F.detect(geometry([...rectangle(0,0,100,100),...rectangle(20,20,60,60),...rectangle(40,40,20,20)]));
  assert.equal(faces.length,3);near(faces.reduce((sum,f)=>sum+f.area,0),10000);
  for(const p of [{x:10,y:10},{x:30,y:30},{x:50,y:50}])assert.equal(faces.filter(f=>scope.F.hit(f,p)).length,1);
});
test('Unit: open gaps and construction lines do not close surfaces; open branches do not split them',()=>{
  assert.equal(scope.F.detect(geometry([line(0,0,10,0),line(10,0,10,10),line(10,10,0,10)])).length,0);
  const lines=rectangle(0,0,10,10);lines[3].construction=true;assert.equal(scope.F.detect(geometry(lines)).length,0);
  const faces=scope.F.detect(geometry([...rectangle(0,0,10,10),line(5,0,5,4),{...line(0,5,10,5),construction:true}]));assert.equal(faces.length,1);near(faces[0].area,100);
});
test('Unit: arc and chord make a surface, including a separate curved surface inside another',()=>{
  const arc={id:'arc',type:'arc',a:{x:30,y:50},via:{x:50,y:30},b:{x:70,y:50}};
  const faces=scope.F.detect(geometry([...rectangle(0,0,100,100),line(30,50,70,50)],[arc]));
  assert.equal(faces.length,2);const curved=faces.find(f=>!f.holes.length);assert.ok(Math.abs(curved.area-200*Math.PI)<.2);near(faces.reduce((sum,f)=>sum+f.area,0),10000);
});
test('Unit: circle and Bézier closed contours are recognized; hidden boundaries are excluded',()=>{
  const circle={type:'circle',center:{x:0,y:0},radius:10},faces=scope.F.detect(geometry([],[circle]));assert.equal(faces.length,1);assert.ok(Math.abs(faces[0].area-100*Math.PI)<.1);
  const bezier={type:'bezier',a:{x:0,y:0},via:{x:5,y:10},b:{x:10,y:0}};assert.equal(scope.F.detect(geometry([line(0,0,10,0)],[bezier])).length,1);
  const g=geometry(rectangle(0,0,10,10));g.layers=[{id:'hidden',visible:false}];g.lines[0].layerId='hidden';assert.equal(scope.F.detect(g).length,0);
});
test('E2E: select independent surfaces and holes on XY, Ctrl-select in 3D, rotate, reload and keep editing',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,click,read})=>{
    await draw('rectangle',[[200,350],[600,600]]);
    await draw('rectangle',[[300,400],[500,550]]);
    await draw('line',[[600,350],[750,475]]);await draw('line',[[750,475],[600,600]]);
    const before=await read();assert.equal(before.planeId,'xy');
    await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    const select=(x,y,ctrl=false)=>clickXY(page,x,y,ctrl,{minX:200,minY:350,maxX:750,maxY:600});
    assert.equal(await page.locator('#plan-board').getAttribute('data-face-count'),'3');
    const initial=await renderValues(page.locator('#plan-orbit'));
    await select(250,450);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'1');
    assert.ok(!(await renderValues(page.locator('#plan-orbit'))).equals(initial));
    await select(400,475,true);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'2');
    await select(675,475,true);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'3');
    await select(400,475,true);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'2');
    assert.deepEqual(await read(),before,'Selecting surfaces does not change sketch geometry');
    assert.ok(await page.locator('#plan-orbit').isVisible());
    await require('./cad-test-helpers.cjs').toggleView(page);await require('./cad-test-helpers.cjs').toggleView(page);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'2');
    await select(900,600);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'0');
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual(await read(),before);
    assert.ok(await page.locator('#plan-orbit').isVisible(),'Reload preserves the 3D view');await page.locator('#plan-faces').click();assert.equal(await page.locator('#plan-board').getAttribute('data-face-count'),'3');
    await require('./cad-test-helpers.cjs').toggleView(page);await draw('line',[[800,450],[850,550]]);assert.equal((await read()).lines.length,before.lines.length+1);
  });}finally{await browser.close();}
});
test('E2E: five regions like the reference, with a curved hole, outer arc and adjacent triangle',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,click,read})=>{
    await draw('rectangle',[[200,300],[700,550]]);
    await draw('rectangle',[[300,350],[600,550]]);
    await draw('three',[[400,450],[450,400],[500,450]]);await draw('line',[[400,450],[500,450]]);
    await draw('three',[[200,550],[200,650],[450,650]]);await draw('line',[[450,650],[450,550]]);
    await draw('line',[[450,550],[550,650]]);await draw('line',[[550,650],[450,650]]);
    const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    assert.equal(await page.locator('#plan-board').getAttribute('data-face-count'),'5');
    for(const [i,p]of [[250,400],[350,450],[450,425],[300,600],[475,625]].entries()){
      await clickXY(page,...p,true,{minX:325-Math.hypot(125,50),minY:300,maxX:700,maxY:600+Math.hypot(125,50)});assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),String(i+1));
    }
    assert.deepEqual(await read(),before);
    const canvas=page.locator('#plan-orbit'),image=await renderValues(canvas),r=await canvas.boundingBox();
    await page.mouse.move(r.x+r.width*.5,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.7,{steps:5});await page.mouse.up();
    assert.ok(!(await renderValues(canvas)).equals(image));assert.deepEqual(await read(),before);
  });}finally{await browser.close();}
});
