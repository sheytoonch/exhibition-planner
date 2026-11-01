// Diagnostic benchmark: real UI input, no application source or model mutations.
const {session,launch}=require('./cad-test-helpers.cjs');
const {clickXY}=require('./orbit-test-helpers.cjs');
const fs=require('node:fs'),path=require('node:path');
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{n:sorted.length,median:sorted[Math.floor(sorted.length/2)]||0,p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0,max:Math.max(0,...sorted)};};
async function main(){
  const browser=await launch(),results=[];
  try{for(const dpr of [1,2])for(const kind of ['rectangle','circle','arc']){
    const adapter={newContext:options=>browser.newContext({...options,deviceScaleFactor:dpr})};
    await session(adapter,async({page,draw,read})=>{
      if(kind==='rectangle')await draw('rectangle',[[300,325],[600,625]]);
      else if(kind==='circle')await draw('circle',[[450,475],[600,475]]);
      else{await draw('three',[[300,475],[450,325],[600,475]]);await draw('line',[[300,475],[600,475]]);}
      const geometry=await read(),bounds={minX:300,minY:325,maxX:600,maxY:kind==='arc'?475:625};
      await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();await clickXY(page,450,400,false,bounds);
      await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').dispatchEvent('input');await page.keyboard.press('Escape');
      await page.evaluate(()=>{
        window.profile={frames:[],events:[],detects:0};
        const paint=PlanRaster.paint;PlanRaster.paint=function(ctx,meshes,dpr){const start=performance.now();try{return paint(ctx,meshes,dpr);}finally{profile.frames.push({ms:performance.now()-start,meshes:meshes.length,points:meshes.reduce((sum,m)=>sum+m.rings.reduce((sum,r)=>sum+r.length,0),0),pixels:ctx.canvas.width*ctx.canvas.height});}};
        const detect=PlanFaces.detect;PlanFaces.detect=function(...args){profile.detects++;return detect(...args);};
        let start=0;document.addEventListener('pointermove',event=>{if(event.target.id==='plan-orbit')start=performance.now();},true);
        document.addEventListener('pointermove',event=>{if(event.target.id==='plan-orbit'&&start){profile.events.push(performance.now()-start);start=0;}});
      });
      const phases=[];
      for(const [plane,deltas]of [['xy',[-30,-15,-5,0,5,15,30]],['xz',[-10,-1,0,1,10]]]){
        for(const dy of deltas){
          await page.locator(`[data-orbit-plane="${plane}"]`).press('Enter');const r=await page.locator('#plan-orbit').boundingBox(),x=r.x+r.width*.48,y=r.y+r.height*.65;
          await page.mouse.move(x,y);await page.evaluate(()=>{profile.frames=[];profile.events=[];profile.detects=0;});
          await page.mouse.down();await page.mouse.move(x+20,y+dy,{steps:4});await page.mouse.up();
          const data=await page.evaluate(()=>structuredClone(profile));phases.push({plane,dy,paint:stats(data.frames.map(f=>f.ms)),event:stats(data.events),detects:data.detects,meshes:data.frames[0]?.meshes,points:data.frames[0]?.points,pixels:data.frames[0]?.pixels});
        }
      }
      // Verify the wheel does not change 3D geometry projection; it currently modifies only the hidden 2D camera.
      await page.locator('[data-orbit-plane="xy"]').press('Enter');await page.mouse.move(0,0);const image=await page.locator('#plan-orbit').screenshot(),r=await page.locator('#plan-orbit').boundingBox();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.wheel(0,-500);await page.mouse.move(0,0);await page.waitForTimeout(100);const zoomUnchanged=(await page.locator('#plan-orbit').screenshot()).equals(image);
      const webgl=await page.evaluate(()=>{const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');if(!gl)return{available:false};const ext=gl.getExtension('WEBGL_debug_renderer_info');return{available:true,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'};});
      const result={kind,dpr,browser:await browser.version(),sourceObjects:geometry.lines.length+geometry.shapes.length,zoomUnchanged,webgl,phases};results.push(result);console.log(JSON.stringify(result));
    });
  }}finally{await browser.close();fs.writeFileSync(path.join(__dirname,'3d-performance-research.json'),JSON.stringify({recordedAt:new Date().toISOString(),viewport:{width:1500,height:1200},results},null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
