const {test}=require('node:test'),assert=require('node:assert/strict');
const {session,launch}=require('./cad-test-helpers.cjs'),{clickXY}=require('./orbit-test-helpers.cjs');

test('Browser: a single lit plane stays uniformly shaded without white stripes in perspective',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  await draw('rectangle',[[200,250],[800,650]]);const geometry=await read();await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#orbit-projection').selectOption('perspective');await require('./render-values.cjs').renderValues(page.locator('#plan-orbit'));
  const result=await page.evaluate(g=>{
   const visible=document.querySelector('#plan-orbit'),sourceGL=visible.getContext('webgl2'),program=sourceGL.getParameter(sourceGL.CURRENT_PROGRAM),matrix=sourceGL.getUniform(program,sourceGL.getUniformLocation(program,'matrix'));
   const canvas=document.createElement('canvas');canvas.width=visible.width;canvas.height=visible.height;const gpu=PlanGpu.create(canvas,()=>{}),gl=canvas.getContext('webgl2'),faces=PlanFaces.detect(g).map(f=>({...f,...PlanFaces.mesh(f)})),face=faces[0],rings=[face.points,...face.holes];
   const mesh=PlanMesh.build({faces,paths:[],lighting:true,models:[{normal:{x:0,y:0,z:1},color:'#f5f5f5',alpha:1,edges:[],picks:[{faceId:face.id,rings}]}]});gpu.draw(mesh,matrix,new Set(),false,false);
   const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const expected=Math.round(245*(PlanLighting.ambient([0,0,1])+.4*PlanLighting.direction[2])),samples=[];
   for(let y=40;y<canvas.height-40;y+=13)for(let x=40;x<canvas.width-40;x+=13){const ray=PlanExhibition.ray(matrix,x,y,canvas.width,canvas.height),hit=ray&&PlanMesh.raycast(mesh,ray.origin,ray.direction,true,true);if(!hit||hit.point.x<220||hit.point.x>780||hit.point.y<270||hit.point.y>630)continue;samples.push(pixels[((canvas.height-1-y)*canvas.width+x)*4]);}
   gpu.dispose?.();return{expected,count:samples.length,bad:samples.filter(v=>Math.abs(v-expected)>3).length,min:Math.min(...samples),max:Math.max(...samples)};
  },geometry);console.log('Perspective plane:',JSON.stringify(result));assert.ok(result.count>100);assert.equal(result.bad,0,JSON.stringify(result));
 });}finally{await browser.close();}
});
test('Browser: walls turned away from the key light retain distinct angle-dependent brightness',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  const result=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const gpu=PlanGpu.create(canvas,()=>{}),gl=canvas.getContext('webgl2'),matrix=new Float32Array([.25,0,0,0,0,-.25,0,0,0,0,-.25,0,-1,1,0,1]);
   // Isolate the material response to two wall normals outside the key light hemisphere.
   const samples=[{x:1,y:0,z:0},{x:0,y:1,z:0}].map(normal=>{
    const mesh=PlanMesh.build({faces:[{id:'wall'}],paths:[],lighting:true,models:[{normal,color:'#ffffff',alpha:1,edges:[],picks:[{faceId:'wall',rings:[[{x:0,y:0},{x:8,y:0},{x:8,y:8},{x:0,y:8}]]}]}]});
    gpu.draw(mesh,matrix,new Set(),false,false);const pixel=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel[0];
   });return{samples,error:gl.getError()};
  });
  assert.equal(result.error,0);assert.ok(Math.abs(result.samples[0]-result.samples[1])>25,JSON.stringify(result));assert.ok(result.samples.every(v=>v>70),'Unlit wall faces remain readable');
 });}finally{await browser.close();}
});
test('Browser: directional shadows cover triangle interiors and preserve holes without diagonal gradients',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  const samples=await page.evaluate(()=>{
   const ring=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],cap=(id,rings,height)=>({color:'#ffffff',alpha:1,edges:[],picks:[{faceId:id,rings:rings.map(r=>r.map(p=>({...p,height})))}]});
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const gpu=PlanGpu.create(canvas,()=>{}),gl=canvas.getContext('webgl2');
   // Clip the elevated caster in the camera view, while it still casts into the floor.
   const matrix=new Float32Array([.125,0,0,0,0,-.125,0,0,0,0,2,0,0,0,0,1]);
   const hole=Array.from({length:64},(_,i)=>({x:.5*Math.cos(i*Math.PI/32),y:.5*Math.sin(i*Math.PI/32)}));
   const floor=cap('floor',[ring(-8,-8,16,16)],0),roof={...cap('roof',[ring(-2,-2,4,4),hole],2),pickable:false};
   const sample=(x,y)=>{const pixel=new Uint8Array(4);gl.readPixels(Math.floor((x+8)*16),Math.floor((8-y)*16),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel[0];};
   return [false,true].map(reverse=>{const models=[floor,roof].map(m=>({...m,picks:m.picks.map(p=>({...p,rings:p.rings.map(r=>reverse?[...r].reverse():r)}))}));gpu.draw(PlanMesh.build({faces:[{id:'floor'},{id:'roof'}],models,paths:[],lighting:true}),matrix,new Set(),false,false);return{lit:sample(6,5),shadow:sample(2.6,1.5),hole:sample(1.125,1.5),litOtherTriangle:sample(-6,-5),error:gl.getError()};});
  });
  for(const s of samples){assert.equal(s.error,0);assert.ok(s.lit-s.shadow>30,JSON.stringify(s));assert.ok(Math.abs(s.hole-s.lit)<4,'Light passes through the hole');assert.ok(Math.abs(s.litOtherTriangle-s.lit)<3,'Coplanar triangles have equal unoccluded illumination');}
  assert.deepEqual(samples[0],samples[1],'Ring direction cannot change the lighting');
 });}finally{await browser.close();}
});
test('Browser: automated browser sessions are offline before application navigation',async()=>{const browser=await launch();try{const page=await browser.newPage();assert.equal(await page.evaluate(()=>navigator.onLine),false);const context=await browser.newContext();const isolated=await context.newPage();assert.equal(await isolated.evaluate(()=>navigator.onLine),false);await context.close();}finally{await browser.close();}});

test('Browser: repeated mesh and background replacement reuses buffers and releases textures',async()=>{
 const browser=await launch();try{await session(browser,async({page})=>{
  const result=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=8;const gl=canvas.getContext('webgl2'),live={};
   for(const type of ['Buffer','Texture','VertexArray','Program','Framebuffer']){const set=new Set();live[type]=set;const create=gl[`create${type}`].bind(gl),remove=gl[`delete${type}`].bind(gl);gl[`create${type}`]=(...args)=>{const value=create(...args);set.add(value);return value;};gl[`delete${type}`]=value=>{set.delete(value);remove(value);};}
   const gpu=PlanGpu.create(canvas,()=>{}),matrix=new Float32Array([.25,0,0,0,0,-.25,0,0,0,0,-.25,0,-1,1,0,1]),corners=[{x:0,y:0},{x:8,y:0},{x:8,y:8},{x:0,y:8}],photo=new Image();
   const source=document.createElement('canvas');source.width=source.height=2;const ctx=source.getContext('2d');ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,2,2);photo.src=source.toDataURL();await photo.decode();let pixel;
   for(let i=0;i<30;i++){const mesh=PlanMesh.build({faces:[],models:[],paths:[]});gpu.draw(mesh,matrix,new Set(),true,false,[{id:`photo${i}`,photo,corners}]);if(i===0){pixel=new Uint8Array(4);gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);}gpu.draw(mesh,matrix,new Set(),true,false,[]);}
   return{live:Object.fromEntries(Object.entries(live).map(([key,set])=>[key,set.size])),pixel:[...pixel],error:gl.getError()};
  });assert.deepEqual(result.live,{Buffer:5,Texture:2,VertexArray:3,Program:4,Framebuffer:1});assert.deepEqual(result.pixel,[255,0,255,255]);assert.equal(result.error,0);
 });}finally{await browser.close();}
});
test('Browser: GPU depth preserves holes and hides rear surfaces independently of submission order',async()=>{
  const browser=await launch();try{await session(browser,async({page})=>{
    const result=await page.evaluate(()=>{
      const ring=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],model=(id,rings,height,color)=>({rings:rings.map(r=>r.map(p=>({...p,height}))),ids:[id],color,alpha:1,edges:[],picks:[{faceId:id,rings:rings.map(r=>r.map(p=>({...p,height})))}]}),front=model('front',[ring(0,0,8,8),ring(3,3,2,2)],2,'#ff0000'),back=model('back',[ring(0,0,8,8)],1,'#0000ff'),results=[];
      const canvas=document.createElement('canvas');canvas.width=canvas.height=8;const gpu=PlanGpu.create(canvas,()=>{}),gl=canvas.getContext('webgl2'),matrix=new Float32Array([.25,0,0,0,0,-.25,0,0,0,0,-.25,0,-1,1,0,1]);
      for(const models of [[front,back],[back,front]]){gpu.draw(PlanMesh.build({faces:[{id:'front'},{id:'back'}],models,paths:[]}),matrix,new Set(),true,false);const pixel=(x,y)=>{const data=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,data);return [...data.slice(0,3)];};results.push([pixel(2,5),pixel(4,3)]);}return results;
    });
    assert.deepEqual(result,[[[255,0,0],[0,0,255]],[[255,0,0],[0,0,255]]]);
  });}finally{await browser.close();}
});
test('E2E: WebGL draws the extrusion, reuses GPU buffers and preserves hole selection',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[200,350],[600,600]]);await draw('rectangle',[[300,400],[500,550]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();
    const bounds={minX:200,minY:350,maxX:600,maxY:600};await clickXY(page,250,475,false,bounds);await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').press('Enter');await clickXY(page,400,475,false,bounds);assert.equal(await page.locator('#plan-board').getAttribute('data-selected-face-count'),'1');
    await page.locator('#plan-extrude').click();assert.equal(await page.locator('#extrude-height').inputValue(),'0','Hole selects its own zero-thickness surface, not the surrounding volume');await page.keyboard.press('Escape');
    const before=await read(),stats=await page.evaluate(()=>({...Plan3DStats})),r=await page.locator('#plan-orbit').boundingBox();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.7,{steps:20});await page.mouse.up();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    const after=await page.evaluate(()=>({...Plan3DStats,error:document.querySelector('#plan-orbit').getContext('webgl2').getError()}));assert.equal(after.error,0);assert.equal(after.sceneBuilds,stats.sceneBuilds);assert.equal(after.uploads,stats.uploads);assert.ok(after.drawCalls<=4);assert.ok(after.triangles>0);assert.equal(after.lighting.enabled,true);assert.equal(after.lighting.method,'shadow-map');assert.equal(after.lighting.shadowBuilds,stats.lighting.shadowBuilds);assert.deepEqual(await read(),before);
  });}finally{await browser.close();}
});
test('E2E: missing WebGL keeps the project and 2D editing available',async()=>{
  const browser=await launch();try{await session({newContext:async options=>{const context=await browser.newContext(options);await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});return context;}},async({page,draw,read})=>{
    await draw('rectangle',[[200,350],[600,600]]);const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);await page.waitForFunction(()=>document.querySelector('#plan-orbit').hidden);assert.deepEqual(await read(),before);await draw('line',[[650,400],[800,500]]);assert.equal((await read()).lines.length,before.lines.length+1);
  });}finally{await browser.close();}
});

test('E2E: extrusion with a circular hole keeps uniform cap light and correctly oriented bottom normals',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[700,600]]);await draw('circle',[[450,475],[500,475]]);
  await page.evaluate(()=>{const build=PlanMesh.build;PlanMesh.build=function(scene){const mesh=build(scene);window.testLightingMesh=mesh;return mesh;};});
  await require('./cad-test-helpers.cjs').toggleView(page);await page.waitForFunction(()=>window.testLightingMesh?.triangles.length>0);
  assert.equal(await page.evaluate(()=>{const mesh=testLightingMesh;return Array.from({length:mesh.vertices.length/9},(_,i)=>i*9).filter(i=>mesh.vertices[i+8]<.5).every(i=>Math.abs(mesh.vertices[i+3]-mesh.vertices[i+4])<1e-6&&Math.abs(mesh.vertices[i+4]-mesh.vertices[i+5])<1e-6);}),true,'Flat figure surfaces also use neutral grays');
  await page.locator('#plan-faces').click();
  await clickXY(page,250,475,false,{minX:200,minY:350,maxX:700,maxY:600});await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('100');await page.locator('#extrude-height').press('Enter');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>Plan3DStats.lighting?.enabled&&window.testLightingMesh?.triangles.some(t=>t.role===1.1));
  const result=await page.evaluate(()=>{
   const mesh=testLightingMesh,triangles=mesh.triangles.filter(t=>t.role===1),top=Math.max(...triangles.map(t=>t.a.height||0));
   const capLight=z=>Array.from({length:mesh.vertices.length/9},(_,i)=>i).filter(i=>mesh.vertices[i*9+8]===1&&Math.abs(mesh.vertices[i*9+2]-z)<1e-6).map(i=>mesh.irradiance[i]);
   const sides=Array.from({length:mesh.vertices.length/9},(_,i)=>i).filter(i=>Math.abs(mesh.vertices[i*9+8]-1.1)<1e-5).map(i=>mesh.ambient[i]);
   const opaque=Array.from({length:mesh.vertices.length/9},(_,i)=>i*9).filter(i=>mesh.vertices[i+8]>=1&&mesh.vertices[i+8]<2);
   const neutral=opaque.every(i=>Math.abs(mesh.vertices[i+3]-mesh.vertices[i+4])<1e-6&&Math.abs(mesh.vertices[i+4]-mesh.vertices[i+5])<1e-6);
   return{top:capLight(top),bottom:capLight(0),sides,neutral,topHeight:top,error:document.querySelector('#plan-orbit').getContext('webgl2').getError()};
  });
  assert.equal(result.error,0);assert.ok(result.topHeight>0);assert.ok(result.top.length>10,'The cap contains the triangulated circular hole');assert.equal(new Set(result.top).size,1,'No diagonal light gradients on the cap');assert.ok(result.top.every(v=>v>.5));assert.ok(result.bottom.length>0&&result.bottom.every(v=>v===0),'The underside does not face the overhead light');
  assert.ok(Math.max(...result.sides)-Math.min(...result.sides)>.25,'Walls and the circular hole retain angle-dependent fill after real UI extrusion');
  assert.equal(result.neutral,true,'Unselected figures use only white and neutral gray materials');
 });}finally{await browser.close();}
});
test('E2E: context loss and restoration preserve the project and rebuild GPU resources',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    await draw('rectangle',[[200,350],[600,600]]);const before=await read();await require('./cad-test-helpers.cjs').toggleView(page);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const uploads=await page.evaluate(()=>Plan3DStats.uploads);
    const supported=await page.evaluate(()=>{const gl=document.querySelector('#plan-orbit').getContext('webgl2');window.lose3d=gl.getExtension('WEBGL_lose_context');if(!lose3d)return false;lose3d.loseContext();return true;});assert.ok(supported);
    await page.waitForFunction(()=>document.querySelector('#plan-orbit').getContext('webgl2').isContextLost());assert.deepEqual(await read(),before);await page.evaluate(()=>lose3d.restoreContext());await page.waitForFunction(previous=>Plan3DStats.uploads>previous,uploads);assert.deepEqual(await read(),before);await require('./cad-test-helpers.cjs').toggleView(page);assert.ok(await page.locator('#plan-lines').isVisible());
  });}finally{await browser.close();}
});
