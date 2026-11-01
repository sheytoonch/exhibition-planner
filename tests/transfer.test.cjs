const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {session,launch}=require('./cad-test-helpers.cjs');
const scope={structuredClone,Blob,crypto:require('node:crypto').webcrypto,atob};
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.T=ProjectTransfer;',scope);
test('Unit: transfer remaps IDs, references and viewport keys without changing originals or blobs',()=>{
 const blob=new Blob(['photo'],{type:'image/webp'}),data={plan:{plans:[{id:'p'}],id:'p',outline:{id:'g',lines:[{id:'l',a:{nodeId:'n'},b:{nodeId:'m'}}]},active:'p',exhibition:{items:[{id:'item',imageId:'i'}]}},records:[{image:{id:'i',blob}}],viewports:{p:{line:'l'}}};
 const copy=scope.T.remap(data);assert.notEqual(copy.plan.id,'p');assert.equal(copy.plan.id,copy.plan.active);assert.equal(copy.plan.exhibition.items[0].imageId,copy.records[0].image.id);assert.equal(copy.viewports[copy.plan.id].line,copy.plan.outline.lines[0].id);assert.equal(copy.records[0].image.blob,blob);assert.equal(data.plan.id,'p');
});
test('Unit: transfer rejects unknown versions, wrong scope and incomplete image records',()=>{
 const data={format:'exhibition-planner',version:1,kind:'images',plan:{version:2,plans:[]},records:[],authors:[],viewports:{}};
 scope.T.validate(data,'images');assert.throws(()=>scope.T.validate(data,'project'));assert.throws(()=>scope.T.validate({...data,version:2},'images'));assert.throws(()=>scope.T.validate({...data,records:[{image:{id:'a'}}]},'images'));
});
async function switchKind(page,kind){if(kind==='project')await page.locator('#transfer-whole').check();else{await page.locator('#transfer-tab-'+kind).click();}}
async function open(page,kind){await page.locator('#transfer-open').click();await switchKind(page,kind);if(kind!=='project')for(const input of await page.locator(kind==='plans'?'#transfer-plan-list input':'#transfer-image-list input').all())await input.check();}
async function exportFile(page){const promise=page.waitForEvent('download');await page.locator('#transfer-export').click();const download=await promise;return fs.readFileSync(await download.path());}
async function upload(page,buffer){await page.locator('#transfer-file').setInputFiles({name:'wystawa.json',mimeType:'application/json',buffer});await page.waitForFunction(()=>!document.querySelector('#transfer-preview').hidden||document.querySelector('#transfer-status').textContent.startsWith('Nie można'));}
async function apply(page){await page.locator('#transfer-apply').click();await page.waitForFunction(()=>document.querySelector('#transfer-status').textContent.startsWith('Import zakończony.'));}
async function close(page){await page.getByRole('button',{name:'Zamknij',exact:true}).click();}
const read=page=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),p=tx.objectStore('library').get('plan'),i=tx.objectStore('library').get('images');tx.oncomplete=()=>{db.close();resolve({plan:p.result,images:(i.result||[]).map(record=>({...record,image:{...record.image,blob:{size:record.image.blob.size,type:record.image.blob.type}}}))});};};}));
test('E2E: selected and multiple plans export, repeated additive import keeps geometry and survives reload',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('line',[[200,200],[500,200]]);await page.locator('#plan-empty').click();await open(page,'plans');
  await page.locator('#transfer-plan-list input').nth(1).uncheck();const single=await exportFile(page);assert.equal(JSON.parse(single).plan.plans.length,1);
  await page.locator('#transfer-plan-list input').nth(1).check();assert.equal(JSON.parse(await exportFile(page)).plan.plans.length,2);
  await upload(page,single);assert.match(await page.locator('#transfer-warning').textContent(),/bez zmian/);await apply(page);await upload(page,single);await apply(page);
  let data=await read(page);assert.equal(data.plan.plans.length,4);assert.equal(new Set(data.plan.plans.map(p=>p.id)).size,4);assert.equal(data.plan.plans[2].outline.lines.length,1);assert.deepEqual(data.plan.plans[0].outline,data.plan.plans[2].outline);
  await close(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);assert.equal((await read(page)).plan.plans.length,4);
 });}finally{await browser.close();}
});
test('E2E: collection adds photos and editor metadata, project warns, cancels and replaces both halves',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.locator('#library-view-button').click();await page.locator('#image-files').setInputFiles({name:'Autor - 80x100cm.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')});
  await page.locator('input[name="title"]').fill('Moja kolekcja');await open(page,'images');const collection=await exportFile(page);assert.equal(JSON.parse(collection).records.length,1);
  await upload(page,collection);await apply(page);assert.equal((await read(page)).images.length,2);
  await switchKind(page,'project');const project=await exportFile(page);await close(page);
  await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();await open(page,'project');await upload(page,project);
  assert.match(await page.locator('#transfer-warning').textContent(),/zostaną utracone/);assert.equal(await page.locator('#transfer-apply').textContent(),'Zastąp projekt');
  await page.locator('#transfer-cancel').click();assert.equal((await read(page)).plan.plans.length,2);
  await upload(page,project);await apply(page);let data=await read(page);assert.equal(data.plan.plans.length,1);assert.equal(data.images.length,2);assert.equal(data.images[1].editor.fields.title.value,'Moja kolekcja');assert.ok(data.images[1].image.blob.size>0);assert.notEqual(data.images[0].image.id,data.images[1].image.id);
  await close(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);await page.locator('#library-view-button').click();assert.equal(await page.locator('.image-card').count(),2);assert.equal(await page.locator('input[name="title"]').nth(1).inputValue(),'Moja kolekcja');
 });}finally{await browser.close();}
});
test('E2E: malformed and mismatched files do not change the project, empty selection explains export',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await open(page,'plans');await page.locator('#transfer-plan-list input').uncheck();await page.locator('#transfer-export').click();await page.waitForFunction(()=>document.querySelector('#transfer-status').textContent.includes('Wybierz co najmniej'));
  await page.locator('#transfer-plan-list input').check();const file=await exportFile(page);await switchKind(page,'images');await upload(page,file);assert.match(await page.locator('#transfer-status').textContent(),/właściwy typ/);
  await upload(page,Buffer.from('{oops'));assert.equal(await page.locator('#transfer-preview').isHidden(),true);assert.equal((await read(page)).plan.plans.length,1);
 });}finally{await browser.close();}
});

test('E2E: plan underlay is embedded in exported file and renders after additive import',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.locator('#plan-files').setInputFiles({name:'podklad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="70"><rect width="100" height="70" fill="blue"/></svg>')});
  await page.waitForFunction(()=>document.querySelectorAll('#plan-surface img[src]').length>0);await open(page,'plans');const file=await exportFile(page);assert.match(JSON.parse(file).plan.plans[0].backgrounds[0].blob.$blob,/^data:image\//);
  await upload(page,file);await apply(page);await close(page);await page.locator('#plan-surface img[src]').evaluate(async image=>{await image.decode();if(!image.naturalWidth)throw Error('Missing underlay');});
  assert.equal((await read(page)).plan.plans.length,2);
 });}finally{await browser.close();}
});
test('E2E: aborted project save keeps session work, leaves stored project intact and permits retry',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await open(page,'project');const file=await exportFile(page);await close(page);await page.locator('#plan-empty').click();
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;window.abortTransfer=true;IDBObjectStore.prototype.put=function(value,key){const result=original.call(this,value,key);if(window.abortTransfer&&key==='authors'){window.abortTransfer=false;this.transaction.abort();}return result;};});
  await open(page,'project');await upload(page,file);await page.locator('#transfer-apply').click();await page.waitForFunction(()=>document.querySelector('#transfer-status').textContent.includes('tylko w tej sesji'));
  assert.equal((await read(page)).plan.plans.length,2);assert.equal(JSON.parse(await exportFile(page)).plan.plans.length,1);
  await upload(page,file);await apply(page);await close(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);assert.equal((await read(page)).plan.plans.length,1);
 });}finally{await browser.close();}
});

test('E2E: transfer uses a right icon, near-fullscreen tabs and manually selected static raster tiles without scroll redraw',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,200],[600,500]]);
  for(let i=0;i<10;i++)await page.locator('#plan-empty').click();
  await page.evaluate(()=>{window.previewStrokes=0;const original=CanvasRenderingContext2D.prototype.stroke;CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.id.startsWith('transfer-raster-'))window.previewStrokes++;return original.apply(this,args);};});
  await page.setViewportSize({width:1500,height:800});await page.locator('#transfer-open').click();
  const box=await page.locator('#transfer-dialog').boundingBox(),viewport=page.viewportSize();assert.ok(box.width>=viewport.width*.9);assert.ok(box.height>=viewport.height*.9);
  assert.equal(await page.locator('#transfer-dialog [role=tab]').count(),2);assert.equal(await page.locator('#transfer-plan-list input:checked').count(),0);
  assert.equal(await page.locator('#transfer-open svg').count(),1);const icon=await page.locator('#transfer-open').boundingBox();assert.ok(icon.x>viewport.width*.8);assert.ok(icon.width<=40);
  await page.waitForFunction(()=>[...document.querySelectorAll('#transfer-plan-list img')].every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.locator('#transfer-plan-list canvas, #transfer-plan-list svg').count(),0);
  const tile=page.locator('#transfer-plan-list label').first(),tileBox=await tile.boundingBox();assert.ok(tileBox.width>=240&&tileBox.height>=180);
  await tile.click();assert.equal(await page.locator('#transfer-plan-list input:checked').count(),1);
  const before=await page.evaluate(()=>window.previewStrokes);assert.ok(before>0);await page.locator('#transfer-scroll').hover();await page.mouse.wheel(0,800);await page.waitForFunction(()=>document.querySelector('#transfer-scroll').scrollTop>0);
  await page.locator('#transfer-tab-images').click();await page.locator('#transfer-tab-plans').click();assert.equal(await page.evaluate(()=>window.previewStrokes),before);assert.equal(await page.locator('#transfer-plan-list input:checked').count(),1);
  assert.equal(JSON.parse(await exportFile(page)).plan.plans.length,1);
 });}finally{await browser.close();}
});

test('Unit: plan thumbnail fits visible geometry and rotated backgrounds without mutating the plan',()=>{
 const plan={outline:{width:1000,height:700,lines:[{id:'line',a:{x:10,y:20},b:{x:110,y:20}}],shapes:[{id:'c',type:'circle',center:{x:60,y:60},radius:20}]},backgrounds:[{x:0,y:0,width:100,height:50,rotation:90}]};
 const original=JSON.stringify(plan),result=scope.T.previewGeometry(plan);assert.equal(result.paths.length,2);assert.ok(result.paths.some(points=>points.length>4));assert.ok(result.bounds.width>=100);assert.ok(result.bounds.height>=100);assert.equal(JSON.stringify(plan),original);
 const hidden=scope.T.previewGeometry({...plan,backgroundVisible:false});assert.equal(hidden.assets.length,0);assert.equal(hidden.bounds.minX,10);
});

test('E2E: image tab selects only chosen artwork and modal stays within a narrow viewport',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.locator('#library-view-button').click();
  const file=name=>({name,mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')});
  await page.locator('#image-files').setInputFiles([file('pierwszy.svg'),file('drugi.svg')]);await page.locator('.image-card').nth(1).waitFor();
  await page.setViewportSize({width:390,height:780});await page.locator('#transfer-open').click();await page.locator('#transfer-tab-images').click();
  assert.equal(await page.locator('#transfer-image-list input:checked').count(),0);await page.locator('#transfer-image-list label').first().click();const data=JSON.parse(await exportFile(page));assert.equal(data.records.length,1);assert.equal(data.records[0].image.name,'pierwszy.svg');assert.equal(data.plan.plans.length,0);
  const box=await page.locator('#transfer-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391);assert.ok(box.y>=0&&box.y+box.height<=781);
  assert.equal(await page.locator('#transfer-scroll').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
  await page.locator('#transfer-tab-images').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#transfer-tab-plans').getAttribute('aria-selected'),'true');
 });}finally{await browser.close();}
});

test('E2E: square plan preview and whole green tile replace the visible checkbox in both themes',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,200],[600,500]]);
  for(let theme=0;theme<2;theme++){
   await page.locator('#transfer-open').click();const tile=page.locator('#transfer-plan-list label').first(),photo=tile.locator('img'),input=tile.locator('input');
   await page.waitForFunction(()=>document.querySelector('#transfer-plan-list img')?.naturalWidth>0);await photo.evaluate(async image=>{await image.decode();});const size=await photo.boundingBox();assert.ok(Math.abs(size.width-size.height)<1,'Square rendered preview');
   assert.deepEqual(await photo.evaluate(image=>[image.naturalWidth,image.naturalHeight]),[640,640]);
   assert.equal(await input.evaluate(node=>getComputedStyle(node).opacity),'0','No visible checkbox icon');
   const initial=await tile.evaluate(node=>getComputedStyle(node).backgroundColor);await tile.click();assert.equal(await input.isChecked(),true);
   const color=await tile.evaluate(node=>getComputedStyle(node).backgroundColor);assert.notEqual(color,initial);const rgb=color.match(/[\d.]+/g).map(Number);assert.ok(rgb[1]>rgb[0]&&rgb[1]>rgb[2],'Whole tile has a green background');
   assert.equal(await photo.evaluate(node=>getComputedStyle(node).mixBlendMode),'multiply','Preview participates in the green selection');
   await input.focus();await page.keyboard.press('Space');assert.equal(await input.isChecked(),false);assert.equal(await tile.evaluate(node=>getComputedStyle(node).backgroundColor),initial);
   await close(page);if(theme===0)await page.locator('#theme-toggle').click();
  }
 });}finally{await browser.close();}
});
