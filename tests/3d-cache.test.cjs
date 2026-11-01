const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch}=require('./cad-test-helpers.cjs'),{clickXY}=require('./orbit-test-helpers.cjs');
test('E2E: camera rotation reuses geometry, boundaries and the canvas allocation',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('circle',[[450,475],[600,475]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();await clickXY(page,450,400,false,{minX:300,minY:325,maxX:600,maxY:625});await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').press('Enter');
    const before=await read();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.evaluate(()=>{
      window.cacheChecks={boundaries:0,detects:0,resizes:0};
      for(const [object,name,key]of [[PlanExtrusions,'displayBoundary','boundaries'],[PlanFaces,'detect','detects']]){const fn=object[name];object[name]=function(...args){cacheChecks[key]++;return fn(...args);};}
      for(const key of ['width','height']){const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);Object.defineProperty(HTMLCanvasElement.prototype,key,{...descriptor,set(value){if(this.id==='plan-orbit')cacheChecks.resizes++;descriptor.set.call(this,value);}});}
    });
    const r=await page.locator('#plan-orbit').boundingBox();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.7,{steps:12});await page.mouse.up();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.deepEqual(await page.evaluate(()=>cacheChecks),{boundaries:0,detects:0,resizes:0});assert.deepEqual(await read(),before);
  });}finally{await browser.close();}
});
