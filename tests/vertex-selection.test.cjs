const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch,near}=require('./cad-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.T=PlanTopology;this.C=PlanConstraints;',scope);
test('Unit: vertex gathers all connected endpoints and one change moves each reference',()=>{
  const point=(x,y,nodeId)=>({x,y,nodeId}),g=scope.T.normalize({lines:[{id:'a',a:point(100,100,'a'),b:point(300,300,'joint')},{id:'b',a:point(300,300,'joint'),b:point(500,200,'b')},{id:'c',a:point(300,300,'joint'),b:point(400,500,'c')}]});
  const vertex=scope.T.vertices(g).find(v=>v.nodeId==='joint');assert.equal(vertex.references.length,3);
  const result=scope.C.solve(g.lines,[{from:vertex.point,to:{x:330,y:350}}],.01);assert.ok(result);for(const ref of vertex.references){near(result[ref.index][ref.key].x,330);near(result[ref.index][ref.key].y,350);}
});
test('Unit: overlapping endpoints that were explicitly separated stay distinct vertices',()=>{
  const g=scope.T.normalize({topologyVersion:1,lines:[{id:'a',a:{x:100,y:100,nodeId:'a'},b:{x:300,y:300,nodeId:'separate-a'}},{id:'b',a:{x:300,y:300,nodeId:'separate-b'},b:{x:500,y:200,nodeId:'b'}}]});
  assert.equal(scope.T.vertices(g).filter(v=>v.point.x===300&&v.point.y===300).length,2);
});
let browser;before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});
test('E2E: a directly selected vertex is shared by a line and an arc',()=>session(browser,async({page,draw,click,read})=>{
  await draw('line',[[200,500],[450,500]]);await draw('three',[[450,500],[550,400],[650,500]]);const initial=await read();assert.equal(initial.lines[0].b.nodeId,initial.shapes[0].a.nodeId);
  await click(450,500);assert.ok(await page.locator('#selection-more').isHidden());const box=await page.locator('#plan-surface').boundingBox();await page.mouse.move(box.x+box.width*.45,box.y+box.height*500/700);await page.mouse.down();await page.mouse.move(box.x+box.width*.48,box.y+box.height*530/700,{steps:8});await page.mouse.up();
  const g=await read();near(g.lines[0].b.x,480);near(g.lines[0].b.y,530);assert.deepEqual(g.lines[0].b,g.shapes[0].a);assert.deepEqual(g.lines[0].a,initial.lines[0].a);assert.deepEqual(g.shapes[0].b,initial.shapes[0].b);assert.deepEqual(g.shapes[0].via,initial.shapes[0].via);
}));
for(const preselect of [false,true])test(`E2E: select shared vertex directly, previous line selection=${preselect}`,()=>session(browser,async({page,draw,click,read})=>{
  await draw('line',[[200,400],[450,450]]);await draw('line',[[450,450],[700,350]]);await draw('line',[[450,450],[650,600]]);
  if(preselect)await click(325,425);
  const initial=await read();await click(450,450);assert.ok(await page.locator('#selection-more').isHidden(),'A point is selected independently from any line');
  const box=await page.locator('#plan-surface').boundingBox(),screen=p=>({x:box.x+box.width*p.x/1000,y:box.y+box.height*p.y/700}),a=screen({x:450,y:450}),b=screen({x:500,y:490});
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
  const g=await read();for(const [index,key]of [[0,'b'],[1,'a'],[2,'a']]){near(g.lines[index][key].x,500);near(g.lines[index][key].y,490);assert.equal(g.lines[index][key].nodeId,g.lines[0].b.nodeId);}
  assert.deepEqual(g.lines[0].a,initial.lines[0].a);assert.deepEqual(g.lines[1].b,initial.lines[1].b);assert.deepEqual(g.lines[2].b,initial.lines[2].b);
  await page.keyboard.press('Control+z');assert.deepEqual((await read()).lines,initial.lines);await page.keyboard.press('Control+y');assert.deepEqual((await read()).lines,g.lines);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.deepEqual((await read()).lines,g.lines);
}));
