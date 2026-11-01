// Numeric geometry and actual GPU uniforms/buffers; no bitmap capture or image files.
async function renderValues(locator){
  const value=await locator.evaluate(async element=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(element.tagName.toLowerCase()==='svg')return[...element.querySelectorAll('path,polygon,line,text')].map(node=>[node.tagName,...['d','points','x1','y1','x2','y2','x','y','transform','aria-pressed'].map(name=>node.getAttribute(name))]);
    if(typeof element.getContext!=='function'){const box=node=>{const r=node.getBoundingClientRect();return[r.x,r.y,r.width,r.height,getComputedStyle(node).transform];};return[box(element),...[...element.querySelectorAll('img,svg,canvas')].map(box),window.__cad2DRender||{}];}
    const gl=element.getContext('webgl2');if(!gl)return{width:element.width,height:element.height,commands:window.__cad2DRender?.[element.id]};
    const program=gl.getParameter(gl.CURRENT_PROGRAM),location=program&&gl.getUniformLocation(program,'matrix'),matrix=location?[...gl.getUniform(program,location)]:[];
    const buffers=[];for(const target of [gl.ARRAY_BUFFER,gl.ELEMENT_ARRAY_BUFFER]){const binding=gl.getParameter(target===gl.ARRAY_BUFFER?gl.ARRAY_BUFFER_BINDING:gl.ELEMENT_ARRAY_BUFFER_BINDING);if(!binding){buffers.push(null);continue;}const data=new Uint8Array(gl.getBufferParameter(target,gl.BUFFER_SIZE));gl.getBufferSubData(target,0,data);let hash=2166136261;for(const byte of data)hash=Math.imul(hash^byte,16777619);buffers.push([data.length,hash>>>0]);}
    return{width:element.width,height:element.height,matrix,buffers,selection:document.querySelector('#plan-board')?.dataset.selectedFaceCount,selectionData:window.__cadSelectionData||[]};
  });
  return Buffer.from(JSON.stringify(value));
}
async function installRenderValues(page){await page.addInitScript(()=>{
  const original=WebGL2RenderingContext.prototype.texImage2D;
  WebGL2RenderingContext.prototype.texImage2D=function(...args){if(args[2]===this.R8&&ArrayBuffer.isView(args[8]))window.__cadSelectionData=Array.from(args[8]);return original.apply(this,args);};
  window.__cad2DRender={};
  for(const name of ['width','height']){const property=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,name);Object.defineProperty(HTMLCanvasElement.prototype,name,{...property,set(value){if(this.id)delete window.__cad2DRender[this.id];property.set.call(this,value);}});}
  for(const method of ['clearRect','moveTo','lineTo','arc','bezierCurveTo','quadraticCurveTo','fillText','stroke','fill','translate','rotate','scale','setTransform']){
    const original=CanvasRenderingContext2D.prototype[method];CanvasRenderingContext2D.prototype[method]=function(...args){const id=this.canvas.id;if(id){let hash=method==='clearRect'?2166136261:window.__cad2DRender[id]||2166136261;const value=JSON.stringify([method,args,...(method==='stroke'?[this.strokeStyle,this.lineWidth]:method==='fillText'?[this.fillStyle,this.font]:method==='fill'?[this.fillStyle]:[])]);for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);window.__cad2DRender[id]=hash>>>0;}return original.apply(this,args);};
  }
});}
module.exports={renderValues,installRenderValues};
