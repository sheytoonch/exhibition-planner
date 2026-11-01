const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {launch,session}=require('./cad-test-helpers.cjs');
const scope={structuredClone,Blob,crypto:require('node:crypto').webcrypto,atob};const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.C=ImageCollections;this.T=ProjectTransfer;',scope);
test('Unit: collection names, membership and export subset preserve independent folders',()=>{
 const folders=[{id:'f',name:'Flowers'},{id:'empty',name:'Empty'}];assert.equal(scope.C.matches({collectionId:'f'},'f'),true);assert.equal(scope.C.matches({},'unfiled'),true);assert.equal(scope.C.matches({},'all'),true);assert.throws(()=>scope.C.name(' flowers ',folders));assert.throws(()=>scope.C.name(' ',folders));assert.equal(scope.C.name('Flowers',folders,'f'),'Flowers');assert.equal(scope.C.uniqueName('Flowers',folders),'Flowers (2)');assert.equal(scope.C.subset(folders,[{image:{collectionId:'f'}}]).length,1);assert.equal(scope.C.subset(folders,[],true).length,2);
});
test('Unit: transfer remaps collection membership and accepts old files without folders',()=>{
 const data={format:'exhibition-planner',version:1,kind:'images',plan:{version:2,plans:[]},records:[{image:{id:'i',name:'art',collectionId:'f',blob:new Blob(['x'],{type:'image/webp'})}}],collections:[{id:'f',name:'Folder'}],authors:[],viewports:{}};
 scope.T.validate(data,'images');const copy=scope.T.remap(data);assert.notEqual(copy.collections[0].id,'f');assert.equal(copy.records[0].image.collectionId,copy.collections[0].id);assert.equal(data.records[0].image.collectionId,'f');assert.throws(()=>scope.T.validate({...data,collections:[]},'images'));assert.throws(()=>scope.T.validate({...data,collections:[{id:'f',name:''}]},'images'));
 const old={...data};delete old.collections;delete old.records[0].image.collectionId;scope.T.validate(old,'images');
});
const file=name=>({name,mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="red"/></svg>')});
async function addImages(page){await page.locator('#library-view-button').click();await page.locator('#image-files').setInputFiles([file('A.svg'),file('B.svg')]);await page.waitForFunction(()=>document.querySelector('#images').getAttribute('aria-busy')==='false');}
const row=(page,name)=>page.locator('#project-collection-list .collection-row').filter({hasText:new RegExp('^'+name+'(?:\\d+)?$')});
async function folder(page,name){await page.locator('#collection-add').click();await page.locator('#collection-name').fill(name);await page.locator('#collection-form button[type=submit]').click();await row(page,name).waitFor();}
async function stored(page){return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),f=tx.objectStore('library').get('collections'),i=tx.objectStore('library').get('images');tx.oncomplete=()=>{db.close();resolve({folders:f.result||[],images:(i.result||[]).map(record=>({id:record.image.id,collectionId:record.image.collectionId,name:record.image.name}))});};};}));}
async function saved(page){await page.waitForFunction(()=>document.querySelector('#storage-status').textContent==='Zapisano w tej przeglądarce.');}
async function exportData(page,whole=false){await page.locator('#transfer-open').click();if(whole)await page.locator('#transfer-whole').check();else{await page.locator('#transfer-tab-images').click();for(const input of await page.locator('#transfer-image-list input').all())await input.check();}const promise=page.waitForEvent('download');await page.locator('#transfer-export').click();const d=await promise;const buffer=fs.readFileSync(await d.path());await page.getByRole('button',{name:'Zamknij',exact:true}).click();return buffer;}
async function importData(page,buffer,whole=false){await page.locator('#transfer-open').click();if(whole)await page.locator('#transfer-whole').check();else await page.locator('#transfer-tab-images').click();const chooser=page.waitForEvent('filechooser');await page.locator('#transfer-import').click();await(await chooser).setFiles({name:'data.json',mimeType:'application/json',buffer});await page.locator('#transfer-apply').click();await page.waitForFunction(()=>document.querySelector('#transfer-status').textContent.startsWith('Import zako'));await page.getByRole('button',{name:'Zamknij',exact:true}).click();}
test('E2E: native drag groups images, filters collection, renames and removes only folder, undo and reload restore it',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);await folder(page,'Flowers');await page.locator('.image-card img').first().dragTo(row(page,'Flowers'));await saved(page);
  let data=await stored(page);assert.equal(data.images[0].collectionId,data.folders[0].id);assert.equal(data.images.length,2);
  await row(page,'Flowers').click();assert.equal(await page.locator('.image-card:visible').count(),1);await page.locator('#collection-rename').click();await page.locator('#collection-name').fill('Landscapes');await page.locator('#collection-form button[type=submit]').click();await row(page,'Landscapes').waitFor();
  await page.locator('#collection-delete').click();await saved(page);data=await stored(page);assert.equal(data.folders.length,0);assert.equal(data.images.length,2);assert.ok(data.images.every(image=>!image.collectionId));
  await page.locator('#undo').click();await saved(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);data=await stored(page);assert.equal(data.folders[0].name,'Landscapes');assert.equal(data.images[0].collectionId,data.folders[0].id);assert.equal(await page.locator('.image-card:visible').count(),1);
  await row(page,'Wszystkie').click();assert.equal(await page.locator('.image-card:visible').count(),2);
 });}finally{await browser.close();}
});
test('E2E: folders accept moves between groups and back to unfiled, with a keyboard-accessible picker',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);await folder(page,'First');await folder(page,'Second');await row(page,'Wszystkie').click();const ids=(await stored(page)).folders;
  await page.locator('.collection-picker select').first().selectOption(ids[0].id);await saved(page);await row(page,'First').click();assert.equal(await page.locator('.image-card:visible').count(),1);
  await page.locator('.image-card:visible img').dragTo(row(page,'Second'));await row(page,'Second').click();assert.equal(await page.locator('.image-card:visible').count(),1);
  await page.locator('.image-card:visible img').dragTo(row(page,'Bez folderu'));await row(page,'Bez folderu').click();assert.equal(await page.locator('.image-card:visible').count(),2);assert.ok((await stored(page)).images.every(image=>!image.collectionId));
 });}finally{await browser.close();}
});
test('E2E: collection export/import preserves membership without overwriting, project includes empty folders and old imports work',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);await folder(page,'Art');let data=await stored(page);await page.locator('.collection-picker select').first().selectOption(data.folders[0].id);await saved(page);await folder(page,'Empty');await saved(page);
  const collection=await exportData(page);assert.equal(JSON.parse(collection).collections.length,1);const project=await exportData(page,true);assert.equal(JSON.parse(project).collections.length,2);
  await importData(page,collection);data=await stored(page);assert.equal(data.images.length,4);assert.equal(data.folders.length,3);assert.equal(data.folders[2].name,'Art (2)');assert.equal(data.images[2].collectionId,data.folders[2].id);assert.notEqual(data.images[0].id,data.images[2].id);
  await importData(page,project,true);data=await stored(page);assert.equal(data.images.length,2);assert.equal(data.folders.length,2);assert.equal(data.folders[1].name,'Empty');assert.equal(data.images[0].collectionId,data.folders[0].id);
  const old=JSON.parse(collection);delete old.collections;for(const record of old.records)delete record.image.collectionId;await importData(page,Buffer.from(JSON.stringify(old)));data=await stored(page);assert.equal(data.images.length,4);assert.equal(data.folders.length,2);assert.ok(!data.images[2].collectionId);
 });}finally{await browser.close();}
});
for(const mode of ['quota','abort'])test('E2E: collection '+mode+' failure keeps session membership, saves atomically on retry and reload',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);await folder(page,'Safe');await saved(page);const id=(await stored(page)).folders[0].id;
  await page.evaluate(mode=>{window.folderFault=mode;const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='collections'&&window.folderFault){if(window.folderFault==='quota')throw new DOMException('Test quota','QuotaExceededError');const r=original.apply(this,arguments);queueMicrotask(()=>this.transaction.abort());return r;}return original.apply(this,arguments);};},mode);
  await page.locator('.collection-picker select').first().selectOption(id);await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('tylko w tej sesji'));assert.ok(!(await stored(page)).images[0].collectionId);await row(page,'Safe').click();assert.equal(await page.locator('.image-card:visible').count(),1);
  await page.evaluate(()=>{window.folderFault=null;});await page.locator('.image-card:visible .collection-picker select').selectOption('');await row(page,'Wszystkie').click();await page.locator('.collection-picker select').first().selectOption(id);await saved(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);assert.equal((await stored(page)).images[0].collectionId,id);
 });}finally{await browser.close();}
});
test('E2E: project tree opens from plan view and selecting a plan preserves its geometry',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('line',[[200,200],[400,200]]);const before=await read();await page.locator('#project-tree-toggle').click();assert.equal(await page.locator('#project-tree').isVisible(),true);await page.locator('#project-tree > details').first().locator('summary').click();await page.locator('#project-tree-plans button').first().click();assert.deepEqual(await read(),before);assert.equal(await page.locator('#project-tree').isHidden(),true);
 });}finally{await browser.close();}
});

test('E2E: new uploads join selected collection, accepted images keep metadata when dragged and duplicate folder names are rejected',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);await folder(page,'Alpha');await page.locator('#collection-add').click();await page.locator('#collection-name').fill('alpha');await page.locator('#collection-form button[type=submit]').click();assert.ok((await page.locator('#collection-error').textContent()).length>0);await page.locator('#collection-cancel').click();assert.equal((await stored(page)).folders.length,1);
  await row(page,'Alpha').click();await page.locator('#image-files').setInputFiles(file('C.svg'));await page.waitForFunction(()=>document.querySelector('#images').getAttribute('aria-busy')==='false');assert.equal(await page.locator('.image-card:visible').count(),1);
  const card=page.locator('.image-card:visible');await card.locator('input[name=title]').fill('Saved title');await card.locator('input[name=widthCm]').fill('80');await card.locator('input[name=heightCm]').fill('100');await card.locator('.save-image').click();await page.waitForFunction(()=>document.querySelector('.accepted-image .save-image-info')?.textContent.includes('Zapisano w'));
  await page.locator('#accepted-tab').click();assert.equal(await page.locator('.image-card:visible').count(),1);await page.locator('.image-card:visible img').dragTo(row(page,'Bez folderu'));await row(page,'Bez folderu').click();assert.equal(await page.locator('.image-card:visible').count(),1);assert.equal(await page.locator('.image-card:visible input[name=title]').inputValue(),'Saved title');
  const branch=row(page,'Bez folderu').locator('..');await branch.click({position:{x:3,y:12}});await page.locator('.collection-artwork').filter({hasText:'Saved title'}).dragTo(row(page,'Alpha'));await saved(page);await row(page,'Alpha').click();assert.equal(await page.locator('.image-card:visible').count(),1);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);assert.equal(await page.locator('.image-card:visible input[name=title]').inputValue(),'Saved title');const data=await stored(page);assert.equal(data.images.find(image=>image.name==='C.svg').collectionId,data.folders[0].id);
 });}finally{await browser.close();}
});

test('E2E: undoing folder creation after artwork acceptance never leaves orphaned membership',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.locator('#library-view-button').click();await folder(page,'Accepted');await row(page,'Accepted').click();await page.locator('#image-files').setInputFiles(file('Work - 80x100cm.svg'));await page.locator('.image-card').waitFor();await page.locator('input[name=title]').fill('Work');await page.locator('input[name=widthCm]').fill('80');await page.locator('input[name=heightCm]').fill('100');await page.locator('.save-image').click();await page.waitForFunction(()=>document.querySelector('.save-image-info')?.textContent.includes('Zapisano w'));
  await page.locator('#undo').click();await saved(page);let data=await stored(page);assert.equal(data.folders.length,0);assert.equal(data.images.length,1);assert.ok(!data.images[0].collectionId);await row(page,'Bez folderu').click();assert.equal(await page.locator('.image-card:visible').count(),1);
  await page.locator('#redo').click();await saved(page);data=await stored(page);assert.equal(data.images[0].collectionId,data.folders[0].id);await row(page,'Accepted').click();assert.equal(await page.locator('.image-card:visible').count(),1);
 });}finally{await browser.close();}
});

test('E2E: narrowing the viewport closes the tree and keeps mobile artwork controls reachable',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);assert.equal(await page.locator('#project-tree').isVisible(),true);await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#project-tree').hidden);assert.equal(await page.locator('#project-tree').isHidden(),true);
  await page.locator('.preview-container').first().hover();assert.equal(await page.locator('.edit-photo').first().isVisible(),true);
  await page.locator('#project-tree-toggle').click();assert.equal(await page.locator('#project-tree').isVisible(),true);await page.locator('#project-tree-close').click();assert.equal(await page.locator('#project-tree').isHidden(),true);
 });}finally{await browser.close();}
});

test('E2E: explorer shows folder and artwork icons with aligned chevrons, indented leaves and flat rows',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);await folder(page,'Styled');await page.locator('.image-card img').first().dragTo(row(page,'Styled'));await row(page,'Styled').click();
  const branch=row(page,'Styled').locator('..');await branch.click({position:{x:3,y:12}});
  const root=page.locator('#project-tree > details').nth(1).locator(':scope > summary'),folderRow=row(page,'Styled'),leaf=page.locator('.collection-artwork').filter({hasText:'A'});
  assert.equal(await root.locator('svg[data-tree-icon=folder]').count(),1);assert.equal(await folderRow.locator('svg[data-tree-icon=folder]').count(),1);assert.equal(await leaf.locator('img[data-tree-icon=artwork]').count(),1);
  const rootIcon=await root.locator('svg').boundingBox(),folderIcon=await folderRow.locator('svg').boundingBox(),leafIcon=await leaf.locator('img[data-tree-icon=artwork]').boundingBox();assert.ok(folderIcon.x-rootIcon.x>=14);assert.ok(leafIcon.x-folderIcon.x>=14);
  const rootBox=await root.boundingBox(),folderBox=await folderRow.boundingBox(),leafBox=await leaf.boundingBox();for(const box of [rootBox,folderBox,leafBox])assert.ok(box.height>=30&&box.height<=36);
  assert.equal(await folderRow.evaluate(node=>getComputedStyle(node).fontWeight),'400');assert.equal(await leaf.locator('..').evaluate(node=>getComputedStyle(node).borderLeftWidth),'0px');
  const closed=await branch.evaluate(node=>getComputedStyle(node,'::before').transform);await branch.focus();await page.keyboard.press('Space');assert.equal(await leaf.isVisible(),false);const folded=await branch.evaluate(node=>getComputedStyle(node,'::before').transform);assert.notEqual(folded,closed);
  await page.keyboard.press('Space');assert.equal(await leaf.isVisible(),true);await leaf.dragTo(row(page,'Bez folderu'));await row(page,'Bez folderu').click();assert.equal(await page.locator('.image-card:visible').count(),2);
 });}finally{await browser.close();}
});

test('E2E: all collection rows align folder icons and labels with and without disclosure arrows',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await addImages(page);await folder(page,'Aligned');
  for(let theme=0;theme<2;theme++){
   for(const width of [1500,390]){
    await page.setViewportSize({width,height:900});if(width===390)await page.waitForFunction(()=>document.querySelector('#project-tree').hidden);if(await page.locator('#project-tree').isHidden())await page.locator('#project-tree-toggle').click();
    const positions=[];for(const name of ['Wszystkie','Bez folderu','Aligned']){const button=row(page,name),icon=await button.locator('svg').boundingBox(),text=await button.locator('.project-tree-name').boundingBox(),box=await button.boundingBox();positions.push({icon:icon.x,text:text.x});assert.ok(Math.abs(icon.y+icon.height/2-box.y-box.height/2)<.5);}
    for(const key of ['icon','text'])assert.ok(Math.max(...positions.map(p=>p[key]))-Math.min(...positions.map(p=>p[key]))<.5,`${key} column is aligned at ${width}px`);
    if(width===390)await page.locator('#project-tree-close').click();
   }
   if(theme===0)await page.locator('#theme-toggle').click();
  }
 });}finally{await browser.close();}
});
