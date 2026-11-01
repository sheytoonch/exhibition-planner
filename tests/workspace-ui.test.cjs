const {test}=require('node:test');
const assert=require('node:assert/strict');
const {launch,session,renameWall}=require('./cad-test-helpers.cjs');
const {clickXY}=require('./orbit-test-helpers.cjs');

test('E2E: each tool menu arrow sits directly below its own icon at desktop and narrow widths',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  assert.equal(await page.title(),'Wystawa');assert.equal(await page.locator('h1').textContent(),'Wystawa');
  assert.equal(await page.locator('#plan-view-button').textContent(),'Projekt');
  assert.equal(await page.locator('#exhibition-back').count(),0);
  assert.equal(await page.locator('#plan-exhibition').count(),0,'Wall selection uses its workspace tab, without a duplicate Exhibition button');
  for(const width of [1440,1024,768]){
   await page.setViewportSize({width,height:800});
   const pairs=await page.locator('.plan-actions .cad-tool-split').evaluateAll(nodes=>nodes.map(el=>{const icon=el.querySelector(':scope > .cad-tool').getBoundingClientRect(),arrow=el.querySelector(':scope > .cad-tool-variants').getBoundingClientRect();return{icon:{x:icon.x,y:icon.y,width:icon.width,height:icon.height},arrow:{x:arrow.x,y:arrow.y,width:arrow.width,height:arrow.height}};}));
   assert.ok(pairs.length>0);for(const {icon,arrow}of pairs){assert.ok(arrow.y>=icon.y+icon.height-.5,'Arrow is below its icon');assert.ok(Math.abs(arrow.x+arrow.width/2-icon.x-icon.width/2)<1,'Arrow is centered under its own icon');assert.ok(arrow.height>=16);}
   await page.locator('[data-tool-menu=line-method-menu]').click();assert.ok(await page.locator('#line-method-menu').isVisible());await page.keyboard.press('Escape');
  }
 });}finally{await browser.close();}
});

test('E2E: clicking an options icon twice closes it for mouse and keyboard',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  for(const [trigger,menu]of [['#plan-more','#plan-menu'],['#plan-precision','#precision-menu'],['#plan-settings-toggle','#plan-settings'],['#view-visibility-toggle','#view-visibility'],['#plan-layers','#layers-menu'],['[data-tool-menu=line-method-menu]','#line-method-menu']]){
   await page.locator(trigger).click();assert.ok(await page.locator(menu).isVisible(),trigger);
   await page.locator(trigger).click();assert.ok(await page.locator(menu).isHidden(),`Second click closes ${trigger}`);
   await page.locator(trigger).focus();await page.keyboard.press('Enter');assert.ok(await page.locator(menu).isVisible(),`Enter opens ${trigger}`);
   await page.keyboard.press('Enter');assert.ok(await page.locator(menu).isHidden(),`Second Enter closes ${trigger}`);
  }
 });}finally{await browser.close();}
});

test('E2E: an explicit 2D button returns from 3D to editable geometry without losing extrusion',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('rectangle',[[300,300],[600,500]]);await require('./cad-test-helpers.cjs').toggleView(page);
  await page.locator('#plan-faces').click();await clickXY(page,450,400,false,{minX:300,minY:300,maxX:600,maxY:500});
  await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').press('Enter');const original=await read();assert.equal(original.extrusions[0].height,1);
  await page.locator('#plan-orbit-toggle').click();assert.equal(await page.locator('#plan-orbit-toggle').getAttribute('aria-pressed'),'true','Selecting active 3D keeps its mode');
  for(const height of [600,800]){
   await page.setViewportSize({width:1024,height});const control=page.getByRole('button',{name:'Edytuj rzut 2D',exact:true});
   assert.ok(await control.isVisible());const box=await control.boundingBox();const heading=await page.locator('.ribbon-heading').boundingBox();assert.ok(box.y>=heading.y&&box.y+box.height<=heading.y+heading.height+1&&box.x+box.width<=1024);
  }
  await page.getByRole('button',{name:'Edytuj rzut 2D',exact:true}).click();assert.equal(await page.locator('#plan-orbit-toggle').getAttribute('aria-pressed'),'false');
  assert.ok(await page.locator('#plan-line').isVisible());assert.deepEqual(await read(),original);
  await draw('line',[[350,400],[500,450]]);assert.equal((await read()).lines.length,original.lines.length+1);
 });}finally{await browser.close();}
});

test('E2E: view controls belong to the viewport and editing tools use labelled SVG icons',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('rectangle',[[300,300],[600,500]]);const original=await read();
  assert.equal(await page.locator('.plan-actions #orbit-view-tools,.plan-actions #plan-wall-list').count(),0);
  assert.equal(await page.locator('.ribbon-heading #plan-orbit-toggle').count(),1);
  assert.equal(await page.locator('.header #plan-empty').count(),1);
  for(const id of ['plan-select','plan-line','plan-precision']){
   const button=page.locator('#'+id);assert.ok((await button.getAttribute('aria-label'))?.length);assert.equal(await button.locator('svg').count(),1);
  }
  await require('./cad-test-helpers.cjs').toggleView(page);
  assert.equal(await page.locator('#orbit-view-tools > #orbit-step-back,#orbit-view-tools > #orbit-step-next').count(),0,'No step arrows below the sphere');
  assert.equal(await page.locator('#camera-settings #orbit-step-back,#camera-settings #orbit-step-next').count(),2,'Camera steps remain accessible in settings');
  for(const width of [1440,1280,1024,768]){
   await page.setViewportSize({width,height:800});
   const dock=await page.locator('#viewport-controls').boundingBox();assert.ok(dock.x>=0&&dock.x+dock.width<=width);assert.ok(dock.width<=220);
   await page.locator('#orbit-projection').selectOption('perspective');await page.locator('#camera-settings-toggle').click();await page.locator('#orbit-step-next').click();await page.keyboard.press('Escape');
  }
  await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#view-visibility-toggle').click();
  assert.equal(await page.locator('#view-visibility [name=grid]').count(),1);
  await page.locator('#view-visibility [name=grid]').uncheck();await page.keyboard.press('Escape');
  const saved=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).precision);};};}));
  assert.equal(saved.grid,false);assert.deepEqual(await read(),original);
 });}finally{await browser.close();}
});

test('E2E: compact workspace keeps tools accessible and focus mode preserves geometry',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[300,300],[600,500]]);
    for(const width of [1440,1280,1024,768]){
      await page.setViewportSize({width,height:800});
      const metrics=await page.evaluate(()=>({bottom:document.querySelector('.plan-actions').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,height:document.querySelector('.plan-actions').getBoundingClientRect().height}));
      assert.ok(metrics.bottom<=170,`Workspace starts at ${metrics.bottom} for width ${width}`);
      assert.ok(metrics.height<=120);assert.equal(metrics.overflow,false);
      await page.locator('#plan-precision').click();assert.ok(await page.locator('#precision-menu').isVisible());await page.keyboard.press('Escape');
    }
    const before=await read();await page.locator('#workspace-focus').click();
    assert.equal(await page.locator('#workspace-focus').getAttribute('aria-pressed'),'true');
    assert.ok(await page.locator('.plan-actions').isHidden());
    await page.locator('#workspace-focus').click();assert.ok(await page.locator('#plan-line').isVisible());
    assert.deepEqual(await read(),before);
  });}finally{await browser.close();}
});

test('E2E: wall library stays above properties and collapsing it gives space back to the wall',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw})=>{
    await draw('rectangle',[[200,350],[600,600]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#view-mode-walls').click();
    assert.ok(await page.locator('.ribbon-model-panel').isHidden(),'Wall selection has no empty Modeling panel');assert.ok((await page.locator('.plan-actions').boundingBox()).height<=32,'Only the workspace tabs occupy the top bar');
    await page.locator('[data-orbit-plane="xy"]').press('Enter');await page.locator('#plan-zoom-reset').click();
    await clickXY(page,400,475,false,{minX:200,minY:350,maxX:600,maxY:600});await page.locator('#exhibition-enter').click();await page.locator('#view-mode-layout').click();
    for(const width of [1280,1024,768]){
      await page.setViewportSize({width,height:800});
      const box=await page.locator('#exhibition-wall').boundingBox();assert.ok(box.width>400);assert.ok(box.height>=620);assert.ok(box.y<=130&&box.y+box.height<=801);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    const libraryTop=await page.locator('.exhibition-sidebar h3').evaluate(e=>e.getBoundingClientRect().top);
    await page.locator('#exhibition-placeholder').click();
    for(const p of [{x:40,y:50},{x:100,y:110}]){
      const q=await page.locator('#exhibition-wall').evaluate((svg,p)=>{const q=new DOMPoint(p.x,Number(svg.dataset.heightCm)-p.y).matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};},p);await page.mouse.click(q.x,q.y);
    }
    assert.equal(await page.locator('[data-placement-id]').count(),1);
    await renameWall(page,'Sala testowa');
    assert.equal(await page.locator('#wall-details').count(),0);assert.ok(await page.locator('#exhibition-properties').isVisible(),'Renaming the active tab must preserve artwork selection');
    assert.equal(await page.locator('.exhibition-sidebar h3').evaluate(e=>e.getBoundingClientRect().top),libraryTop,'Selection must not push artwork sources down');
    const before=await page.locator('#exhibition-wall').boundingBox();await page.locator('#exhibition-panel-toggle').click();
    assert.ok(await page.locator('.exhibition-sidebar').isHidden());assert.ok((await page.locator('#exhibition-wall').boundingBox()).width>before.width);
    await page.locator('#exhibition-panel-toggle').click();assert.ok(await page.locator('#exhibition-properties').isVisible());
    await page.locator('#exhibition-panel-toggle').click();
    await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await page.locator('[data-placement-id]').count(),1);assert.ok(await page.locator('.exhibition-sidebar').isHidden());
    assert.equal(await page.locator('#wall-tabs [aria-selected=true]').textContent(),'Sala testowa');
    await page.locator('#exhibition-panel-toggle').click();assert.ok(await page.locator('.exhibition-sidebar').isVisible());
    await page.locator('#view-mode-walls').click();await require('./cad-test-helpers.cjs').toggleView(page);
    assert.ok(await page.locator('#wall-tabs-bar').isHidden(),'Wall names are hidden in the 2D sketch');await page.locator('#plan-orbit-toggle').click();assert.ok(await page.locator('#wall-tabs-bar').isHidden(),'Wall names are hidden in the 3D model');await page.locator('#view-mode-walls').click();assert.ok(await page.locator('#wall-tabs-bar').isVisible(),'Wall names are visible when selecting exhibition walls');
    await page.locator('#wall-tabs button').first().click();assert.ok(await page.locator('#exhibition-editor').isVisible());
    assert.ok(await page.locator('#wall-tabs-bar').isVisible(),'Wall names remain visible in exhibition layout');
  });}finally{await browser.close();}
});

test('E2E: camera settings open from the keyboard and dismissal returns focus without editing geometry',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[300,300],[600,500]]);const geometry=await read();
    await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#orbit-projection').selectOption('perspective');await page.locator('#camera-settings-toggle').focus();await page.keyboard.press('Enter');
    assert.ok(await page.locator('#camera-settings').isVisible());await page.keyboard.press('Escape');
    assert.ok(await page.locator('#camera-settings').isHidden());assert.equal(await page.evaluate(()=>document.activeElement.id),'camera-settings-toggle');
    await page.keyboard.press('Tab');
    const focus=await page.evaluate(()=>({width:getComputedStyle(document.activeElement).outlineWidth,style:getComputedStyle(document.activeElement).outlineStyle}));
    assert.equal(focus.style,'solid');assert.ok(parseFloat(focus.width)>=2);
    assert.ok(await page.locator('#workspace-tooltip').isVisible());
    const angle=await page.locator('#orbit-step-angle').textContent(),zoom=await page.locator('#plan-zoom-label').textContent();
    await page.locator('#workspace-focus').click();await page.locator('#workspace-focus').click();
    assert.equal(await page.locator('#orbit-step-angle').textContent(),angle);assert.equal(await page.locator('#plan-zoom-label').textContent(),zoom);assert.deepEqual(await read(),geometry);
    for(const width of [1280,1024,768]){await page.setViewportSize({width,height:800});assert.ok(await page.locator('.plan-actions').evaluate(e=>e.getBoundingClientRect().bottom<=170));}
  });}finally{await browser.close();}
});

test('E2E: an unfinished image import does not block work on the space',async()=>{
  const browser=await launch();try{await session(browser,async({page})=>{
    await page.locator('#library-view-button').click();
    await page.locator('#image-files').setInputFiles({name:'pending.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="red"/></svg>')});
    await page.waitForFunction(()=>document.querySelector('#pending-tab').textContent.includes('(1)'));
    assert.equal(await page.locator('#plan-view-button').isEnabled(),true);
    await page.locator('#plan-view-button').click();assert.ok(await page.locator('#plan-surface').isVisible());
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.ok(await page.locator('#plan-surface').isVisible());
    await page.locator('#library-view-button').click();assert.match(await page.locator('#pending-tab').textContent(),/\(1\)/);
  });}finally{await browser.close();}
});
