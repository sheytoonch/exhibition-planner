export type Point = { x: number; y: number };
export type Vertex = Point & { id: string };
export type Wall = { id: string; a: string; b: string; height: number; thickness: number; name: string };
export type Artwork = { id: string; title: string; description: string; width: number; height: number; image: string; inferred?: boolean };
export type Placement = { id: string; artworkId: string; wallId?: string; t: number; side: number; x: number; y: number; elevation: number; rotation: number; tilt: number };
export type Opening = { id: string; wallId: string; kind: 'door' | 'window'; t: number; width: number; height: number; sill: number };
export type Measure = { id: string; a: Point; b: Point; aVertex?: string; bVertex?: string };
export type Underlay = { image: string; name: string; x: number; y: number; width: number; height: number; opacity: number; visible: boolean };
export type Note = { id: string; text: string; author: string; done: boolean; created: string };
export type Project = { id: string; name: string; vertices: Vertex[]; walls: Wall[]; artworks: Artwork[]; placements: Placement[]; openings: Opening[]; measures: Measure[]; underlay?: Underlay; notes: Note[]; updated: string };
export type Selection = { kind: 'wall' | 'placement' | 'artwork' | 'opening' | 'measure'; id: string } | null;
export type Tool = 'select' | 'wall' | 'measure' | 'calibrate' | 'door' | 'window';
export const uid = () => crypto.randomUUID();
export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export function wallPoints(p: Project, w: Wall): [Vertex, Vertex] { return [p.vertices.find(v => v.id === w.a)!, p.vertices.find(v => v.id === w.b)!]; }
export function projectOnWall(p: Project, w: Wall, pt: Point) {
  const [a,b] = wallPoints(p,w), l = distance(a,b), ux = (b.x-a.x)/l, uy=(b.y-a.y)/l;
  const t = Math.max(0, Math.min(l, (pt.x-a.x)*ux+(pt.y-a.y)*uy));
  const point = {x:a.x+ux*t,y:a.y+uy*t};
  return {t, point, distance: distance(point,pt), side: ((pt.x-a.x)*-uy+(pt.y-a.y)*ux)>=0?1:-1};
}
export function position(p: Project, item: Placement) {
  const w = p.walls.find(w=>w.id===item.wallId);
  if(!w) return {x:item.x,y:item.y,angle:item.rotation};
  const [a,b]=wallPoints(p,w), angle=Math.atan2(b.y-a.y,b.x-a.x), offset=(w.thickness/2+2)*item.side;
  return {x:a.x+Math.cos(angle)*item.t-Math.sin(angle)*offset,y:a.y+Math.sin(angle)*item.t+Math.cos(angle)*offset,angle:angle*180/Math.PI+(item.side<0?180:0)+item.rotation};
}
export function attach(p: Project, item: Placement, point: Point, snap = true): Placement {
  const nearest=p.walls.map(w=>({w,...projectOnWall(p,w,point)})).sort((a,b)=>a.distance-b.distance)[0];
  if(snap && nearest && nearest.distance<45) return {...item,wallId:nearest.w.id,t:nearest.t,side:nearest.side,x:point.x,y:point.y,rotation:0};
  return {...item,wallId:undefined,x:point.x,y:point.y};
}
export function parseDimensions(text: string, aspect?: number): {width:number;height:number;assumed:boolean} | null {
  const pattern=/(\d+(?:[.,]\d+)?)\s*(cm|mm|m)?\s*(?:x|×|\bna\b)\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)?\b/gi;
  const m=pattern.exec(text); if(!m)return null;
  const factor=(u:string)=>u==='m'?100:u==='mm'?.1:1;
  let width=Number(m[1].replace(',','.'))*factor((m[2]||m[4]||'cm').toLowerCase());
  let height=Number(m[3].replace(',','.'))*factor((m[4]||m[2]||'cm').toLowerCase());
  if(width<=0||height<=0||width>10000||height>10000)return null;
  if(aspect && ((aspect<.95&&width>height)||(aspect>1.05&&width<height))) [width,height]=[height,width];
  return {width,height,assumed:!m[2]&&!m[4]};
}
export function emptyProject(name='Nowa wystawa'):Project { return {id:uid(),name,vertices:[],walls:[],artworks:[],placements:[],openings:[],measures:[],notes:[],updated:new Date().toISOString()}; }
export function addRoom(p:Project,width=900,depth=650):Project {
  const vs=[{x:0,y:0},{x:width,y:0},{x:width,y:depth},{x:0,y:depth}].map(v=>({...v,id:uid()}));
  return {...p,vertices:[...p.vertices,...vs],walls:[...p.walls,...vs.map((v,i)=>({id:uid(),a:v.id,b:vs[(i+1)%4].id,height:300,thickness:16,name:`Ściana ${p.walls.length+i+1}`}))]};
}
export function deleteSelection(p:Project,s:Selection):Project {
  if(!s)return p;
  if(s.kind==='wall') return {...p,walls:p.walls.filter(w=>w.id!==s.id),openings:p.openings.filter(o=>o.wallId!==s.id),placements:p.placements.filter(x=>x.wallId!==s.id)};
  if(s.kind==='artwork')return {...p,artworks:p.artworks.filter(a=>a.id!==s.id),placements:p.placements.filter(x=>x.artworkId!==s.id)};
  if(s.kind==='placement')return {...p,placements:p.placements.filter(x=>x.id!==s.id)};
  if(s.kind==='opening')return {...p,openings:p.openings.filter(x=>x.id!==s.id)};
  return {...p,measures:p.measures.filter(x=>x.id!==s.id)};
}
export function validateProject(value:unknown): asserts value is Project {
  const p=value as Project;
  if(!p||typeof p.id!=='string'||typeof p.name!=='string'||!['vertices','walls','artworks','placements','openings','measures','notes'].every(k=>Array.isArray((p as any)[k])))throw Error('Niepoprawna struktura projektu.');
  const finite=(...ns:number[])=>ns.every(n=>typeof n==='number'&&Number.isFinite(n));
  const ids=new Set<string>(); for(const list of [p.vertices,p.walls,p.artworks,p.placements,p.openings,p.measures,p.notes]) for(const x of list){if(typeof x.id!=='string'||ids.has(x.id))throw Error('Niepoprawne identyfikatory.');ids.add(x.id);}
  for(const v of p.vertices)if(!finite(v.x,v.y)||Math.abs(v.x)>1e6||Math.abs(v.y)>1e6)throw Error('Niepoprawne współrzędne.');
  for(const w of p.walls){if(!p.vertices.some(v=>v.id===w.a)||!p.vertices.some(v=>v.id===w.b)||!finite(w.height,w.thickness)||w.height<=0||w.thickness<=0||distance(...wallPoints(p,w))<1)throw Error('Niepoprawna ściana.');}
  for(const a of p.artworks)if(!finite(a.width,a.height)||a.width<=0||a.height<=0||typeof a.title!=='string'||typeof a.description!=='string'||typeof a.image!=='string'||(!a.image.startsWith('data:image/')&&a.image!==''))throw Error('Niepoprawne dane obrazu.');
  for(const x of p.placements)if(!p.artworks.some(a=>a.id===x.artworkId)||(x.wallId&&!p.walls.some(w=>w.id===x.wallId))||!finite(x.t,x.side,x.x,x.y,x.elevation,x.rotation,x.tilt))throw Error('Niepoprawne rozmieszczenie.');
  for(const o of p.openings)if(!p.walls.some(w=>w.id===o.wallId)||!finite(o.t,o.width,o.height,o.sill)||o.width<=0||o.height<=0||!['door','window'].includes(o.kind))throw Error('Niepoprawny otwór.');
  for(const m of p.measures)if(!m.a||!m.b||!finite(m.a.x,m.a.y,m.b.x,m.b.y))throw Error('Niepoprawny pomiar.');
  if(p.underlay&&(!p.underlay.image.startsWith('data:image/')||!finite(p.underlay.x,p.underlay.y,p.underlay.width,p.underlay.height,p.underlay.opacity)||p.underlay.width<=0||p.underlay.height<=0))throw Error('Niepoprawny podkład.');
}
