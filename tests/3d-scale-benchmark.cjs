// Component benchmark; actual UI interactions are covered by 3d-benchmark.cjs.
const fs=require('node:fs'),{launch,session}=require('./cad-test-helpers.cjs');
(async()=>{const browser=await launch();try{await session(browser,async({page})=>{
 const results=await page.evaluate(async()=>{
  const output=[],canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const gpu=PlanGpu.create(canvas,()=>{}),gl=canvas.getContext('webgl2');
  for(const count of [1,10,100,1000]){
   const faces=[],models=[],lines=[];
   for(let i=0;i<count;i++){const x=i%40*12,y=Math.floor(i/40)*12,id=`f${i}`,ring=[{x,y,height:5},{x:x+10,y,height:5},{x:x+10,y:y+10,height:5},{x,y:y+10,height:5}];for(let j=0;j<4;j++)lines.push({id:`${id}-${j}`,a:ring[j],b:ring[(j+1)%4]});faces.push({id});models.push({rings:[ring],ids:[id],color:'#88b6a0',alpha:1,edges:[],picks:[{faceId:id,rings:[ring]}]});}
   const topologyStart=performance.now(),detected=PlanFaces.detect({planeId:'xy',lines,shapes:[]}),topologyMs=performance.now()-topologyStart;
   const start=performance.now(),mesh=PlanMesh.build({faces,models,paths:[]}),buildMs=performance.now()-start,matrix=new Float32Array([1/250,0,0,0,0,-1/160,0,0,0,0,-.01,0,-1,1,0,1]);
   const upload=performance.now();gpu.draw(mesh,matrix,new Set(),true,false);const uploadMs=performance.now()-upload,samples=[];
   for(let n=0;n<60;n++){await new Promise(requestAnimationFrame);matrix[12]=-1+Math.sin(n/10)*.05;const begin=performance.now();gpu.draw(mesh,matrix,new Set(),true,false);samples.push(performance.now()-begin);}
   samples.sort((a,b)=>a-b);PlanMesh.raycast(mesh,[5,5,100],[0,0,-1],true);
   if(detected.length!==count)throw Error(`Expected ${count} faces, got ${detected.length}`);
   output.push({count,topologyMs,buildMs,uploadMs,cpuP95:samples[56],triangles:mesh.triangles.length,drawCalls:Plan3DStats.drawCalls,pickCandidates:Plan3DStats.pickCandidates,error:gl.getError()});
  }return output;
 });fs.writeFileSync(__dirname+'/3d-scale-results.json',JSON.stringify({scope:'GPU component benchmark; generated independent surfaces, not a UI project',results},null,2));console.log(results);
 });}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
