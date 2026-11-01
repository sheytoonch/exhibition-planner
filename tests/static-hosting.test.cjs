require('./offline-tests.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {launch}=require('./cad-test-helpers.cjs');
const {allowLoopback}=require('./offline-tests.cjs');
async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return 'http://127.0.0.1:'+server.address().port;}
async function stop(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
test('E2E: static hosting in a subdirectory loads relative assets and preserves a drawing after reload while outside origins stay blocked',async()=>{
 const requests=[],root=path.resolve(__dirname,'..'),prefix='/preview/exhibition/';let forbiddenHits=0;
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;requests.push(pathname);
  const file=pathname.startsWith(prefix)?pathname.slice(prefix.length):'';
  if(!['index.html','app.js','style.css'].includes(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,file)));
 });
 const other=http.createServer((req,res)=>{forbiddenHits++;res.end('not allowed');});
 const origin=await listen(server),forbidden=await listen(other),browser=await launch();
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await allowLoopback(context,origin);await page.goto(origin+prefix+'index.html');
  await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
  await page.locator('#plan-view-button').click();await page.locator('#plan-empty').click();
  await page.locator('[data-tool-menu=line-method-menu]').click();await page.locator('[data-line-method=line]').click();
  const box=await page.locator('#plan-surface').boundingBox();
  await page.mouse.click(box.x+box.width*.2,box.y+box.height*.5);await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5);await page.keyboard.press('Escape');
  const read=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('exhibition-planner-v2');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result);};};}));
  const before=await read();assert.equal(before.plans.find(p=>p.id===before.active).outline.lines.length,1);
  assert.equal(await page.evaluate(url=>fetch(url).then(()=>false,()=>true),forbidden+'/blocked'),true);
  assert.equal(await page.evaluate(()=>fetch('https://example.invalid/blocked').then(()=>false,()=>true)),true);
  assert.equal(forbiddenHits,0,'even a different loopback origin stays blocked');
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
  assert.deepEqual(await read(),before);
  for(const file of ['index.html','app.js','style.css'])assert.ok(requests.includes(prefix+file),'Missing relative resource: '+file);
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();await stop(server);await stop(other);}
});
test('Unit: HTTP test exception rejects remote origins and non-exact loopback URLs before enabling any network',async()=>{
 for(const origin of ['https://example.com','http://localhost:1234','http://127.0.0.1:1234/path','http://127.0.0.1','http://user@127.0.0.1:1234']){
  await assert.rejects(()=>allowLoopback({setOffline:()=>{throw Error('Network must not be enabled');}},origin),/Only an exact/);
 }
});
