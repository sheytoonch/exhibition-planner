import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { emptyProject, uid, validateProject, type Project } from './model';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export async function saveWorkspace(projects:Project[],active:string){
 const db=await database();
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put({projects,active},'current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();
}
function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('wystawa-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('workspace');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function loadWorkspace():Promise<{projects:Project[];active:string}|undefined>{const db=await database();const result=await new Promise<any>((resolve,reject)=>{const r=db.transaction('workspace').objectStore('workspace').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();if(result){for(const p of result.projects)validateProject(p);}return result;}
export type PackageKind='project'|'artworks'|'space';
export function downloadProject(project:Project,kind:PackageKind){
 let p=structuredClone(project);
 if(kind==='artworks')p={...emptyProject(p.name+' — prace'),artworks:p.artworks};
 if(kind==='space')p={...p,artworks:[],placements:[],notes:[]};
 const files:Record<string,Uint8Array>={};
 const images=new Map<string,string>();
 function asset(data:string){if(!data)return '';if(images.has(data))return images.get(data)!;const path=`assets/${images.size}.txt`;images.set(data,path);files[path]=strToU8(data);return path;}
 for(const a of p.artworks)a.image=asset(a.image);
 if(p.underlay)p.underlay.image=asset(p.underlay.image);
 files['manifest.json']=strToU8(JSON.stringify({format:'wystawa',version:1,kind,project:p}));
 const zip=zipSync(files,{level:3});const url=URL.createObjectURL(new Blob([zip as BlobPart],{type:'application/zip'}));
 const a=document.createElement('a');a.href=url;a.download=project.name.replace(/[^\p{L}\p{N} _-]/gu,'')+`-${kind}.exhibition`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
export async function readPackage(file:File):Promise<{project:Project;kind:PackageKind}>{
 if(file.size>150*1024*1024)throw Error('Plik projektu przekracza limit pierwszej wersji: 150 MB.');
 let total=0;
 const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>{total+=f.originalSize;if(total>350*1024*1024)throw Error('Rozpakowany projekt jest zbyt duży.');return f.name==='manifest.json'||/^assets\/\d+\.txt$/.test(f.name);}});
 if(!files['manifest.json'])throw Error('To nie jest plik projektu Wystawa.');
 const data=JSON.parse(strFromU8(files['manifest.json']));
 if(data.format!=='wystawa'||data.version!==1)throw Error('Nieobsługiwana wersja pliku projektu.');
 if(!['project','artworks','space'].includes(data.kind))throw Error('Nieznany rodzaj pakietu.');
 const p=data.project as Project;
 if(!p||!Array.isArray(p.artworks))throw Error('Brak danych projektu.');
 function asset(path:string){if(path==='')return '';if(!files[path]||!/^assets\/\d+\.txt$/.test(path))throw Error('Brakuje grafiki w archiwum.');return strFromU8(files[path]);}
 for(const a of p.artworks)a.image=asset(a.image);
 if(p.underlay)p.underlay.image=asset(p.underlay.image);
 validateProject(p);return {project:p,kind:data.kind};
}
export function mergeArtworks(target:Project,source:Project){const known=new Set(target.artworks.map(a=>a.id));return {...target,artworks:[...target.artworks,...source.artworks.filter(a=>!known.has(a.id))]};}
export function replaceSpace(target:Project,source:Project){return {...target,vertices:structuredClone(source.vertices),walls:structuredClone(source.walls),openings:structuredClone(source.openings),measures:structuredClone(source.measures),underlay:structuredClone(source.underlay),placements:[]};}
export type ImageResult={image:string;width:number;height:number;name:string};
export async function optimizeImage(file:File,maxSide=1600):Promise<ImageResult>{
 if(file.size>100*1024*1024)throw Error(`${file.name}: limit importu pojedynczej grafiki to 100 MB. Zmniejsz oryginał przed importem.`);
 const bitmap=await createImageBitmap(file);try{
 if(bitmap.width*bitmap.height>100_000_000)throw Error(`${file.name}: grafika ma ponad 100 megapikseli.`);
 return rasterize(bitmap,bitmap.width,bitmap.height,file.name,maxSide);
 }finally{bitmap.close();}
}
function rasterize(source:CanvasImageSource,width:number,height:number,name:string,maxSide:number):ImageResult {
 const scale=Math.min(1,maxSide/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/webp',.86);canvas.width=1;canvas.height=1;return {image,width,height,name};
}
let pdfModule:Promise<typeof import('pdfjs-dist')>|undefined;
export async function openPdf(file:File){
 if(file.size>100*1024*1024)throw Error('PDF przekracza 100 MB. Podziel go na mniejsze pliki.');
 pdfModule??=import('pdfjs-dist');const pdf=await pdfModule;pdf.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
 return pdf.getDocument({data:await file.arrayBuffer()}).promise;
}
export async function pdfPage(doc:Awaited<ReturnType<typeof openPdf>>,pageNumber:number,maxSide=2400):Promise<ImageResult>{const page=await doc.getPage(pageNumber);const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(3,maxSide/Math.max(base.width,base.height))});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport}).promise;const result=rasterize(canvas,canvas.width,canvas.height,`Strona ${pageNumber}`,maxSide);page.cleanup();return result;}
export function duplicateProject(p:Project){return {...structuredClone(p),id:uid(),name:p.name+' — kopia'};}
