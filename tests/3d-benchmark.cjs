const {session,launch}=require('./cad-test-helpers.cjs'),{clickXY}=require('./orbit-test-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const stats=values=>{const s=[...values].sort((a,b)=>a-b);return{n:s.length,median:s[Math.floor(s.length*.5)]||0,p95:s[Math.min(s.length-1,Math.floor(s.length*.95))]||0,max:Math.max(0,...s)};};
async function fixture(draw,kind){
  if(kind==='rectangle')await draw('rectangle',[[300,325],[600,625]]);
  else if(kind==='circle')await draw('circle',[[450,475],[600,475]]);
  else if(kind==='arc'){await draw('three',[[300,475],[450,325],[600,475]]);await draw('line',[[300,475],[600,475]]);}
  else{
    await draw('rectangle',[[200,300],[700,550]]);await draw('rectangle',[[300,350],[600,550]]);
    if(kind==='five'){
      await draw('three',[[400,450],[450,400],[500,450]]);await draw('line',[[400,450],[500,450]]);
      await draw('three',[[200,550],[200,650],[450,650]]);await draw('line',[[450,650],[450,550]]);await draw('line',[[450,550],[550,650]]);await draw('line',[[550,650],[450,650]]);
    }
  }
  const r=Math.hypot(125,50);
  return kind==='five'?{minX:325-r,minY:300,maxX:700,maxY:600+r}:kind==='hole'?{minX:200,minY:300,maxX:700,maxY:550}:{minX:300,minY:325,maxX:600,maxY:kind==='arc'?475:625};
}
async function run(label='current'){
  const browser=await launch(),results=[],environment={browser:browser.version(),cpu:require('node:os').cpus()[0].model,platform:process.platform};
  try{for(const dpr of [1,2])for(const kind of ['rectangle','circle','arc','hole','five']){
    await session({newContext:o=>browser.newContext({...o,deviceScaleFactor:dpr})},async({page,draw,read})=>{
      if(!environment.renderer)environment.renderer=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';});
      const bounds=await fixture(draw,kind);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
      await clickXY(page,...(['hole','five'].includes(kind)?[250,400]:[450,400]),false,bounds);await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').press('Enter');
      const before=await read();
      await page.evaluate(()=>{
        window.profile={paint:[],events:[],raf:[],long:[],detects:0};if(typeof Plan3DStats!=='undefined'){Plan3DStats.cpuSamples=[];Plan3DStats.gpuSamples=[];Plan3DStats.profiling=true;}
        if(typeof PlanRaster!=='undefined'){const paint=PlanRaster.paint;PlanRaster.paint=function(...args){const t=performance.now();try{return paint(...args);}finally{profile.paint.push(performance.now()-t);}};}
        const detect=PlanFaces.detect;PlanFaces.detect=function(...args){profile.detects++;return detect(...args);};
        let t;document.addEventListener('pointermove',e=>{if(e.target.id==='plan-orbit')t=performance.now();},true);document.addEventListener('pointermove',e=>{if(e.target.id==='plan-orbit')profile.events.push(performance.now()-t);});
        const tick=t=>{profile.raf.push(t);window.profileRaf=requestAnimationFrame(tick);};window.profileRaf=requestAnimationFrame(tick);
        window.profileObserver=new PerformanceObserver(list=>profile.long.push(...list.getEntries().map(e=>e.duration)));profileObserver.observe({entryTypes:['longtask']});
      });
      for(const plane of ['xy','xz','yz'])for(const direction of [-1,1]){
        await page.locator(`[data-orbit-plane="${plane}"]`).press('Enter');const r=await page.locator('#plan-orbit').boundingBox(),x=r.x+r.width*.48,y=r.y+r.height*.55;
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+direction*200,{steps:12});await page.mouse.move(x,y-direction*200,{steps:12});await page.mouse.up();
      }
      const data=await page.evaluate(()=>{cancelAnimationFrame(profileRaf);profileObserver.disconnect();return{...profile,gpu:typeof Plan3DStats==='undefined'?null:{...Plan3DStats},webgl:!!document.createElement('canvas').getContext('webgl2')};});
      const result={kind,dpr,events:stats(data.events),cpuRender:stats(data.gpu?.cpuSamples||data.paint),rafIntervals:stats(data.raf.slice(1).map((v,i)=>v-data.raf[i])),longTasks:stats(data.long),detects:data.detects,gpu:data.gpu,webgl:data.webgl,gpuTime:stats(data.gpu?.gpuSamples||[]),modelUnchanged:JSON.stringify(await read())===JSON.stringify(before)};results.push(result);console.log(JSON.stringify({...result,gpu:result.gpu?{...result.gpu,cpuSamples:undefined}:null}));
    });
  }if(label==='gpu'){const assert=require('node:assert/strict');for(const result of results){assert.ok(result.modelUnchanged,`${result.kind}: camera changed the model`);assert.equal(result.detects,0,`${result.kind}: camera rebuilt topology`);assert.ok(result.cpuRender.p95<10,`${result.kind} DPR${result.dpr}: CPU p95 exceeds 10 ms`);assert.equal(result.longTasks.n,0,`${result.kind}: long task during rotation`);}}}finally{await browser.close();fs.writeFileSync(path.join(__dirname,`3d-benchmark-${label}.json`),JSON.stringify({label,environment,source:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../app.js'))).digest('hex'),viewport:{width:1500,height:1200},results},null,2));}
}
if(require.main===module)run(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture,stats};
