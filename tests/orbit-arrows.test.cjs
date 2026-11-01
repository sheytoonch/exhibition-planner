const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.O=PlanOrbit;',scope);
test('Unit: rotation arrows turn around each world axis and preserve its direction',()=>{
  const O=scope.O;for(const plane of ['default','xy','xz','yz'])for(const axis of ['x','y','z']){const camera=O.plane(plane),next=O.turn(camera,axis,.6),point={x:0,y:0,z:0};point[axis]=1;const a=O.rotate(point,camera.yaw,camera.pitch,camera.roll),b=O.rotate(point,next.yaw,next.pitch,next.roll);for(const key of ['x','y','z'])near(a[key],b[key]);const full=O.turn(camera,axis,Math.PI*2),p={x:2,y:3,z:4},before=O.rotate(p,camera.yaw,camera.pitch,camera.roll),after=O.rotate(p,full.yaw,full.pitch,full.roll);for(const key of ['x','y','z'])near(before[key],after[key]);}
});
test('Unit: 135-degree tracks span one quadrant plus 22.5-degree ends in their rotation planes',()=>{
 for(const axis of ['x','y','z']){const arc=scope.O.rotationArc(axis);assert.equal(arc.length,49);const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,(a.x*b.x+a.y*b.y+a.z*b.z)/(1.55*1.55))));near(angle(arc[0],arc[8]),Math.PI/8);near(angle(arc[8],arc[40]),Math.PI/2);near(angle(arc[40],arc.at(-1)),Math.PI/8);near(angle(arc[0],arc.at(-1)),3*Math.PI/4);for(const p of arc){near(p[axis],0);near(Math.hypot(p.x,p.y,p.z),1.55);}const central=arc.slice(8,41);for(const p of central)for(const key of ['x','y','z'])assert.ok(p[key]>=-1e-10,'Central quadrant stays in the positive plane patch');}
 for(const axis of ['x','y','z'])for(const direction of [1,-1]){
  const points=scope.O.rotationArrow(axis,direction);assert.equal(points.length,9);
  for(const p of points){near(p[axis],0);near(Math.hypot(p.x,p.y,p.z),1.55);}
  const p=points.at(-1),a=points.at(-2),tangent={x:p.x-a.x,y:p.y-a.y,z:p.z-a.z},velocity=axis==='x'?{x:0,y:-p.z,z:p.y}:axis==='y'?{x:p.z,y:0,z:-p.x}:{x:-p.y,y:p.x,z:0};
  assert.ok(direction*(velocity.x*tangent.x+velocity.y*tangent.y+velocity.z*tangent.z)>0,'Arrow head agrees with the signed world-axis rotation');
 }
});
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});

test('Unit: arrowhead triangles stay in the rotation plane and foreshorten to its edge',()=>{
 for(const [axis,plane]of [['x','yz'],['y','xz'],['z','xy']])for(const direction of [1,-1]){
  const head=scope.O.rotationHead(axis,direction),tip=scope.O.rotationArrow(axis,direction).at(-1);assert.equal(head.length,3);
  for(const p of head)near(p[axis],0);for(const key of ['x','y','z'])near(head[0][key],tip[key]);
  const area=cam=>{const p=head.map(v=>scope.O.rotate(v,cam.yaw,cam.pitch,cam.roll));return Math.abs((p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[2].x-p[0].x)*(p[1].y-p[0].y))/2;};
  assert.ok(area(scope.O.plane(plane))>.08,'Front-on arrowhead retains a readable triangle');
  assert.ok(area(scope.O.plane(axis==='z'?'xz':'xy'))<1e-8,'Edge-on arrowhead lies in the plane rather than facing the screen');
 }
});

test('E2E: arrowheads are projected with their planes through default and orthographic views',()=>session(browser,async({page,draw,read})=>{
 await draw('line',[[200,400],[500,450]]);const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);
 assert.equal(await page.locator('#orbit-gizmo .orbit-rotation-head').count(),6,'Heads use plane geometry instead of screen-space markers');
 for(const plane of ['default','xy','xz','yz']){
  if(plane==='default')await page.locator('#orbit-gizmo-home').click();else await page.locator(`[data-orbit-plane="${plane}"]`).press('Enter');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  const camera=scope.O.plane(plane),heads=await page.locator('#orbit-gizmo [data-orbit-axis]').evaluateAll(nodes=>nodes.map(el=>({axis:el.dataset.orbitAxis,direction:Number(el.dataset.orbitDirection),points:[...el.querySelector('.orbit-rotation-head').points].map(p=>({x:p.x,y:p.y})),marker:getComputedStyle(el.querySelector('.orbit-rotation-line')).markerEnd})));
  for(const head of heads){assert.equal(head.marker,'none');const expected=scope.O.rotationHead(head.axis,head.direction).map(p=>scope.O.rotate(p,camera.yaw,camera.pitch,camera.roll));assert.equal(head.points.length,3);for(let i=0;i<3;i++){near(head.points[i].x,64+30*expected[i].x);near(head.points[i].y,76+30*expected[i].y);}}
 }
 assert.deepEqual(await read(),before);
}));

test('E2E: three continuous 135-degree tracks connect six clickable terminal arrows',()=>session(browser,async({page,draw,read})=>{
 await draw('line',[[200,400],[500,450]]);const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);
 const controls=page.locator('#orbit-gizmo [data-orbit-axis]');assert.equal(await controls.count(),6);
 const svgBox=await page.locator('#orbit-gizmo-svg').boundingBox();assert.ok(svgBox.width>=128,'The manipulator is large enough to point at');
 const hitStyle=await controls.first().locator('.orbit-rotation-hit').evaluate(el=>({width:parseFloat(getComputedStyle(el).strokeWidth),cursor:getComputedStyle(el).cursor}));assert.ok(hitStyle.width>=24,'Arrow targets include a generous margin');assert.equal(hitStyle.cursor,'pointer','Rotation buttons use a pointer, not the panning hand');
 assert.equal(await page.locator('#orbit-gizmo .orbit-rotation-head').count(),6,'Six large plane-projected arrowheads remain visible');
 assert.equal(await page.locator('#orbit-gizmo .orbit-rotation-track').count(),3);
 for(const [axis,plane]of [['x','yz'],['y','xz'],['z','xy']]){
  const pair=page.locator(`#orbit-gizmo [data-orbit-axis="${axis}"]`);
  assert.equal(await pair.count(),2);
  for(const direction of ['1','-1']){
   const arrow=page.locator(`#orbit-gizmo [data-orbit-axis="${axis}"][data-orbit-direction="${direction}"]`);
   assert.equal(await arrow.getAttribute('data-orbit-rotation-plane'),plane);
   const length=await arrow.locator('.orbit-rotation-line').evaluate(el=>el.getTotalLength());assert.ok(length>2&&length<40,'Short plane arc replaces almost complete circle');
   const ends=await arrow.locator('.orbit-rotation-line').evaluate((el,{axis,direction})=>{const track=document.querySelector(`[data-orbit-track="${axis}"]`),a=el.getPointAtLength(el.getTotalLength()),b=track.getPointAtLength(direction==='1'?track.getTotalLength():0);return Math.hypot(a.x-b.x,a.y-b.y);},{axis,direction});assert.ok(ends<.01,'Both arrowheads terminate the same continuous track');
  }
 }
 assert.deepEqual(await read(),before);
}));
test('E2E: axis arrows support click, drag and keyboard without modifying geometry',()=>session(browser,async({page,draw,read})=>{
  page.setDefaultTimeout(5000);await draw('line',[[200,400],[500,450]]);const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);const gizmo=page.locator('#orbit-gizmo'),svg=page.locator('#orbit-gizmo-svg'),home=gizmo.getByRole('button',{name:'Widok izometryczny',exact:true});
  const axes=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));return svg.locator('.orbit-axes line').evaluateAll(nodes=>nodes.map(n=>[n.getAttribute('x2'),n.getAttribute('y2')]));};
  const checkTurn=async(axis,angle)=>{const camera=scope.O.turn(scope.O.plane('default'),axis,angle),actual=await axes();for(const [i,p]of [{x:1.65,y:0,z:0},{x:0,y:1.65,z:0},{x:0,y:0,z:1.65}].entries()){const q=scope.O.rotate(p,camera.yaw,camera.pitch,camera.roll);near(Number(actual[i][0]),64+30*q.x);near(Number(actual[i][1]),76+30*q.y);}};
  for(const axis of ['x','y','z'])for(const direction of [1,-1]){await home.click();const arrow=gizmo.locator(`[data-orbit-axis="${axis}"][data-orbit-direction="${direction}"]`),initial=await axes();await arrow.press('Enter');assert.notDeepEqual(await axes(),initial);await checkTurn(axis,direction*Math.PI/12);await home.click();await axes();
    const path=arrow.locator('.orbit-rotation-hit'),point=await path.evaluate(el=>{const p=el.getPointAtLength(el.getTotalLength()),q=new DOMPoint(p.x,p.y).matrixTransform(el.getScreenCTM());if(document.elementFromPoint(q.x,q.y)?.closest('[data-orbit-axis]')!==el.parentElement)throw Error('Arrowhead is not directly clickable: '+el.parentElement.dataset.orbitAxis+' '+el.parentElement.dataset.orbitDirection+'; target='+document.elementFromPoint(q.x,q.y)?.outerHTML.slice(0,220));return{x:q.x,y:q.y};});
    await page.mouse.click(point.x,point.y);assert.notDeepEqual(await axes(),initial,`Click ${axis} ${direction}`);await checkTurn(axis,direction*Math.PI/12);await home.click();await axes();
    const center=await svg.evaluate(el=>{const p=new DOMPoint(64,76).matrixTransform(el.getScreenCTM());return{x:p.x,y:p.y};}),distance=Math.hypot(point.x-center.x,point.y-center.y);
    await page.mouse.click(point.x+6*(point.x-center.x)/distance,point.y+6*(point.y-center.y)/distance);await checkTurn(axis,direction*Math.PI/12);await home.click();await axes();
    await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+35,point.y-25,{steps:8});await page.mouse.up();assert.notDeepEqual(await axes(),initial,`Drag ${axis} ${direction}`);await checkTurn(axis,direction*.72);assert.deepEqual(await read(),before);
  }
  await home.click();const arrow=gizmo.locator('[data-orbit-axis="z"][data-orbit-direction="1"]'),initial=await axes();await arrow.press('ArrowRight');await arrow.press('ArrowLeft');const final=await axes();for(let i=0;i<3;i++)for(let j=0;j<2;j++)near(Number(initial[i][j]),Number(final[i][j]));assert.deepEqual(await read(),before);
}));
