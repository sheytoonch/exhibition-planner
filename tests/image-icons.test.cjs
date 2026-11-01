const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {launch,session}=require('./cad-test-helpers.cjs');
const scope={Blob};const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.I=ImageIcons;',scope);
test('Unit: center-square crop handles portraits, landscapes, squares and extreme aspect ratios',()=>{
 for(const [w,h,x,y,side]of [[100,300,0,100,100],[300,100,100,0,100],[100,100,0,0,100],[1,10000,0,4999.5,1],[10000,1,4999.5,0,1]])assert.deepEqual(JSON.parse(JSON.stringify(scope.I.centerCrop(w,h))),{x,y,width:side,height:side});
});
test('Unit: icon crop rejects invalid source dimensions',()=>{for(const pair of [[0,100],[-1,100],[100,NaN],[Infinity,100]])assert.throws(()=>scope.I.centerCrop(...pair));});
test('Unit: icon generation rejects invalid images and output sizes',async()=>{await assert.rejects(scope.I.create({}));for(const size of [0,1.5,257])await assert.rejects(scope.I.create(new Blob(['image']),size));});
function track(){window.iconDraws=[];const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='artwork-icon')window.iconDraws.push({source:[args[0].naturalWidth,args[0].naturalHeight],crop:args.slice(1),output:[this.canvas.width,this.canvas.height]});return original.apply(this,args);};}
const file=(name,w,h)=>({name,mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="red"/><rect x="${w/3}" y="${h/3}" width="${w/3}" height="${h/3}" fill="blue"/></svg>`)});
async function add(page,files){await page.locator('#library-view-button').click();await page.locator('#image-files').setInputFiles(files);await page.waitForFunction(()=>document.querySelector('#images').getAttribute('aria-busy')==='false');}
async function ready(page,count){await page.waitForFunction(count=>{const icons=[...document.querySelectorAll('.collection-artwork img[data-tree-icon=artwork]')];return icons.length===count&&icons.every(icon=>icon.complete&&icon.naturalWidth===48&&icon.naturalHeight===48);},count);}
const icon=page=>page.locator('.collection-artwork img[data-tree-icon=artwork]').first();
const row=(page,id)=>page.locator(`.collection-row[data-collection-id="${id}"]`);
test('E2E: uploads eagerly generate real 48px center-cropped icons, reused across tree rebuilds, scroll and project reload',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.addInitScript(track);await page.evaluate(track);await page.setViewportSize({width:1500,height:600});await add(page,[file('Portrait.svg',100,300),file('Landscape.svg',300,100)]);await ready(page,2);
  let calls=await page.evaluate(()=>window.iconDraws);assert.equal(calls.length,2);assert.deepEqual(calls.map(call=>call.crop),[[0,100,100,100,0,0,48,48],[100,0,100,100,0,0,48,48]]);assert.ok(calls.every(call=>call.output[0]===48&&call.output[1]===48));assert.equal(await page.locator('#project-tree canvas').count(),0);
  const summary=row(page,'unfiled').locator('..');assert.equal(await summary.locator('..').getAttribute('open'),null);await summary.click({position:{x:3,y:12}});const box=await icon(page).boundingBox();assert.equal(box.width,18);assert.equal(box.height,18);const src=await icon(page).getAttribute('src');assert.match(src,/^data:image\/png;base64,/);
  await page.locator('#collection-add').click();await page.locator('#collection-name').fill('Cached');await page.locator('#collection-form button[type=submit]').click();await row(page,'all').click();await page.locator('#project-tree-toggle').click();await page.locator('#project-tree-toggle').click();
  await page.locator('#images').hover();await page.mouse.wheel(0,500);await page.waitForFunction(()=>scrollY>0);assert.equal(await page.evaluate(()=>window.iconDraws.length),2);assert.equal(await icon(page).getAttribute('src'),src);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);await ready(page,2);assert.equal(await page.evaluate(()=>window.iconDraws.length),2);assert.equal(await icon(page).getAttribute('src'),src);
 });}finally{await browser.close();}
});
test('E2E: photo edits update icons, undo and redo reuse cached variants and metadata edits never regenerate them',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  await page.addInitScript(track);await page.evaluate(track);await add(page,file('Editable.svg',100,300));await ready(page,1);const original=await icon(page).getAttribute('src');await row(page,'unfiled').locator('..').click({position:{x:3,y:12}});
  await page.locator('.preview-container').hover();await page.locator('.rotate-photo').click();await page.waitForFunction(()=>!document.querySelector('.rotate-photo').disabled);await page.waitForFunction(src=>document.querySelector('.collection-artwork img')?.src!==src,original);await ready(page,1);const rotated=await icon(page).getAttribute('src');assert.notEqual(rotated,original);assert.equal(await page.evaluate(()=>window.iconDraws.length),2);
  await page.locator('#undo').click();await page.waitForFunction(src=>document.querySelector('.collection-artwork img')?.src===src,original);await page.locator('#redo').click();await page.waitForFunction(src=>document.querySelector('.collection-artwork img')?.src===src,rotated);assert.equal(await page.evaluate(()=>window.iconDraws.length),2);
  await page.locator('input[name=title]').fill('Changed metadata');await page.locator('input[name=title]').blur();await ready(page,1);assert.equal(await page.evaluate(()=>window.iconDraws.length),2);
  await page.locator('.preview-container').hover();await page.locator('.edit-photo').click();await page.waitForFunction(()=>!document.querySelector('.photo-apply').disabled);await page.locator('.photo-editor [data-action=right]').click();await page.waitForFunction(()=>!document.querySelector('.photo-apply').disabled);await page.locator('.photo-apply').click();await page.locator('.photo-editor').waitFor({state:'detached'});await ready(page,1);await page.waitForFunction(()=>window.iconDraws.length===3);assert.notEqual(await icon(page).getAttribute('src'),rotated);
  const edited=await icon(page).getAttribute('src');await page.reload();await page.waitForFunction(()=>!document.querySelector('#transfer-open').disabled);await ready(page,1);assert.equal(await icon(page).getAttribute('src'),edited);assert.equal(await page.evaluate(()=>window.iconDraws.length),1);
 });}finally{await browser.close();}
});
