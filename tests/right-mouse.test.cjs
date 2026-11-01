const {renderValues}=require('./render-values.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch}=require('./cad-test-helpers.cjs');

test('E2E: right mouse is disabled in 2D and 3D, including the orientation gizmo',async()=>{
  const browser=await launch();
  try{await session(browser,async({page,draw,read})=>{
    await draw('line',[[200,400],[500,450]]);
    const before=await read();
    await page.evaluate(()=>{
      window.contextMenus=[];
      document.addEventListener('contextmenu',event=>window.contextMenus.push(event.defaultPrevented));
    });
    for(const selector of ['#plan-lines','#plan-orbit','#orbit-gizmo']){
      if(selector==='#plan-orbit')await require('./cad-test-helpers.cjs').toggleView(page);
      await page.mouse.move(0,0);
      const target=page.locator(selector),box=await target.boundingBox();
      await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6);
      const image=await renderValues(target);
      await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
      await page.mouse.down({button:'right'});
      await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:5});
      await page.mouse.up({button:'right'});
      assert.deepEqual(JSON.parse((await renderValues(target)).toString()),JSON.parse(image.toString()),`Right drag must not change the view: ${selector}`);
      assert.deepEqual(await read(),before);
    }
    assert.deepEqual(await page.evaluate(()=>window.contextMenus),[true,true,true],'Browser context menu must be suppressed');
  });}finally{await browser.close();}
});
