const {renderValues}=require('./render-values.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {session,launch,near,renameWall}=require('./cad-test-helpers.cjs');
const {clickXY}=require('./orbit-test-helpers.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8'),scope={structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('\n(() => {'))+'\nthis.E=PlanExhibition;this.F=PlanFaces;',scope);
test('Unit: corresponding-edge dimensions differ from clear gaps and preserve unequal artwork widths',()=>{
 const surface={widthCm:300,heightCm:200},data={items:[{id:'a',x:20,y:50,widthCm:40,heightCm:60},{id:'b',x:100,y:50,widthCm:60,heightCm:60}],lines:[],guides:[]};
 const measure=(first,second)=>scope.E.measurement(surface,data,{axis:'x',a:{kind:'item',id:'a',edge:first},b:{kind:'item',id:'b',edge:second}}).value;
 near(measure('left','left'),80);near(measure('right','right'),100);near(measure('right','left'),40);
});
test('Unit: horizontal dimensions of lower-row artwork route below the wall, upper rows remain above',()=>{
 const surface={heightCm:200},items=[{id:'a',x:20,y:130,widthCm:60,heightCm:60},{id:'b',x:120,y:130,widthCm:60,heightCm:60},{id:'lower',x:80,y:20,widthCm:60,heightCm:60}],dimension={axis:'x',a:{kind:'wall',edge:'left'},b:{kind:'item',id:'lower',edge:'left'},offset:100};
 near(scope.E.dimensionOffset(surface,dimension,2,100,null,items),-10);near(scope.E.dimensionOffset(surface,dimension,2,100,220,items),220);
 near(scope.E.dimensionOffset(surface,dimension,2,100,-30,items),-30);
 assert.ok(scope.E.dimensionOffset(surface,{...dimension,b:{...dimension.b,id:'a'}},2,100,null,items)>200);
 assert.ok(scope.E.dimensionOffset(surface,dimension,2,100,null,[items[2]])>200,'One artwork does not create a lower row on its own');
});
test('Unit: vertical artwork gaps are measured in the overlap of both widths',()=>{
 const items=[{id:'left',x:20,widthCm:90},{id:'right',x:170,widthCm:100},{id:'lower',x:90,widthCm:100}],dimension={axis:'y',a:{kind:'item',id:'left',edge:'bottom'},b:{kind:'item',id:'lower',edge:'top'}};
 near(scope.E.artworkGapOffset(items,dimension),100);near(scope.E.artworkGapOffset(items,dimension,40),100);near(scope.E.artworkGapOffset(items,dimension,105),105);
 near(scope.E.artworkGapOffset(items,{...dimension,a:{...dimension.a,id:'right'}}),180);
 assert.equal(scope.E.artworkGapOffset(items,{...dimension,axis:'x'}),null);
 assert.equal(scope.E.artworkGapOffset(items,{...dimension,b:{...dimension.b,id:'right'}}),null);
});
test('Unit: dimensions between artworks stop at both edges, with ticks inside the gap in either direction',()=>{
 for(const [p,q]of [[{x:5,y:10},{x:5,y:40}],[{x:5,y:40},{x:5,y:10}],[{x:10,y:5},{x:40,y:5}],[{x:40,y:5},{x:10,y:5}]]){
  const geometry=scope.E.dimensionSegment(p,q,2,true),axis=p.x===q.x?'y':'x',min=Math.min(p[axis],q[axis]),max=Math.max(p[axis],q[axis]);
  near(geometry.line.x1,p.x);near(geometry.line.y1,p.y);near(geometry.line.x2,q.x);near(geometry.line.y2,q.y);
  for(const tick of geometry.ticks){near(Math.abs(tick.x2-tick.x1),Math.abs(tick.y2-tick.y1));for(const end of [1,2])assert.ok(tick[axis+end]>=min&&tick[axis+end]<=max);}
 }
});
test('Unit: exhibition guides choose the nearest horizontal or vertical direction in all quadrants',()=>{
 const start={x:100,y:100};for(const [point,expected]of [[{x:180,y:110},{x:180,y:100}],[{x:20,y:90},{x:20,y:100}],[{x:110,y:180},{x:100,y:180}],[{x:90,y:20},{x:100,y:20}]]){const end=scope.E.orthogonalEndpoint(start,point);near(end.x,expected.x);near(end.y,expected.y);}
});
test('Unit: horizontal artwork-to-wall distances sit above the wall, including old interior offsets',()=>{
 const surface={heightCm:126.6},dimension={axis:'x',a:{kind:'wall',edge:'left'},b:{kind:'item',id:'art',edge:'left'},offset:80};
 for(const scale of [1,3,8]){const offset=scope.E.dimensionOffset(surface,dimension,scale,80);assert.ok(offset>surface.heightCm);near((offset-surface.heightCm)*scale,20);}
 near(scope.E.dimensionOffset(surface,dimension,2,80,160),160);
 near(scope.E.dimensionOffset(surface,{...dimension,a:{kind:'line'}},2,80,90),136.6);near(scope.E.dimensionOffset(surface,dimension,2,80,0),-10);near(scope.E.dimensionOffset(surface,dimension,2,80,-10),-10);
 near(scope.E.dimensionOffset(surface,{...dimension,axis:'y'},2,80,90),90);
});
test('Unit: reversed measurements of the same edges share a key but equal distances between other objects do not',()=>{
 const a={kind:'item',id:'a',edge:'right'},b={kind:'item',id:'b',edge:'left'};
 assert.equal(scope.E.dimensionKey({axis:'x',a,b}),scope.E.dimensionKey({axis:'x',a:b,b:a}));
 assert.notEqual(scope.E.dimensionKey({axis:'x',a,b}),scope.E.dimensionKey({axis:'x',a,b:{...b,id:'c'}}));
});
test('Unit: wall list includes designated or occupied walls and combines only connected coplanar surfaces',()=>{
  const rect=(id,x,width=100,height=200)=>({id,origin:{x,y:0,height:0},u:{x:1,y:0,height:0},v:{x:0,y:0,height:1},normal:{x:0,y:-1,height:0},cm:1,widthCm:width,heightCm:height,rings:[[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}]]}),a=rect('a',0),b=rect('b',100),other=rect('other',300);
  const merged=scope.E.combine([a,b],'combined');assert.ok(merged);near(merged.widthCm,200);near(merged.heightCm,200);assert.ok(scope.E.fits(merged,{x:80,y:20,widthCm:40,heightCm:100}),'Artwork can cross the seam');
  assert.equal(scope.E.combine([a,other],'gap'),null);assert.equal(scope.E.combine([a,{...b,origin:{x:100,y:10,height:0}}],'different-plane'),null);
  const stepped=scope.E.combine([a,rect('short',100,100,100)],'step');assert.ok(stepped);assert.ok(!scope.E.fits(stepped,{x:120,y:130,widthCm:40,heightCm:40}),'A merge cannot fill missing wall area');
  const corner={...rect('corner',100),origin:{x:100,y:0,height:200}};assert.equal(scope.E.combine([a,corner],'corner-contact'),null,'Touching only at a corner does not form a wall');
  const frame=[rect('bottom',0,300,100),{...rect('top',0,300,100),origin:{x:0,y:0,height:200}},{...rect('left',0,100,100),origin:{x:0,y:0,height:100}},{...rect('right',200,100,100),origin:{x:200,y:0,height:100}}];const withHole=scope.E.combine(frame,'window');assert.ok(withHole);assert.ok(!scope.E.fits(withHole,{x:140,y:140,widthCm:20,heightCm:20}),'Openings stay empty');
  const exhibition={surfaces:{a:{items:[],guides:[]},b:{designated:true,items:[]},other:{items:[{imageId:'work'}]}}};assert.deepEqual(Array.from(scope.E.walls([a,b,other],exhibition),w=>w.id),['b','other']);
});
test('Unit: dimensions show one decimal in centimeters; only wall dimensions include units',()=>{
  assert.equal(scope.E.formatDimension(65.52),'65,5');assert.equal(scope.E.formatDimension(65.49),'65,5');assert.equal(scope.E.formatDimension(0),'0,0');assert.equal(scope.E.formatDimension(143.33,true),'143,3 cm');
});
test('Unit: a library artwork can be placed only once across all walls of a plan',()=>{
  const exhibition={surfaces:{a:{items:[{imageId:'work'}]},b:{items:[{kind:'placeholder'}]}}};
  assert.equal(scope.E.placed(exhibition,'work'),true);assert.equal(scope.E.placed(exhibition,'other'),false);assert.equal(scope.E.placed(exhibition,undefined),false);
  exhibition.surfaces.a.items=[];assert.equal(scope.E.placed(exhibition,'work'),false);
});
test('Unit: placed artworks are unavailable across every plan until removed from their wall',()=>{
  const plans=[{exhibition:{surfaces:{a:{items:[{imageId:'work'}]}}}},{exhibition:{surfaces:{b:{items:[]}}}}];
  assert.equal(scope.E.placed(plans,'work'),true);assert.equal(scope.E.placed(plans,'unused'),false);plans[0].exhibition.surfaces.a.items=[];assert.equal(scope.E.placed(plans,'work'),false);
});
test('Unit: flat walls keep physical dimensions, reject curved sides and map local coordinates',()=>{
  const lines=[[[0,0],[400,0]],[[400,0],[400,250]],[[400,250],[0,250]],[[0,250],[0,0]]].map(([a,b],i)=>({id:String(i),a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]}})),g={planeId:'xy',metersPerUnit:.01,lines,shapes:[]};
  const faces=scope.F.detect(g).map(f=>({...f,...scope.F.mesh(f)}));g.extrusions=[{id:'group',faceIds:faces.map(f=>f.id),height:3}];const surfaces=scope.E.surfaces(g,faces),walls=surfaces.filter(s=>s.name==='Ściana');assert.equal(walls.length,4);const wall=walls.find(w=>Math.abs(w.widthCm-400)<1e-7);near(wall.heightCm,300);
  const p=scope.E.local(wall,scope.E.world(wall,50,75,3));near(p.x,50);near(p.y,75);near(p.distance,3);assert.ok(scope.E.fits(wall,{x:10,y:10,widthCm:80,heightCm:100}));assert.ok(!scope.E.fits(wall,{x:390,y:10,widthCm:80,heightCm:100}));
  assert.ok(scope.E.fits(wall,{x:320,y:200,widthCm:80,heightCm:100}),'Images can align exactly to the right and top edges');
  const front=walls.find(w=>w.normal.y>.9);assert.ok(front.u.x>0,'Left-to-right placement matches the outside view of the front wall');
  const circle={planeId:'xy',metersPerUnit:.01,lines:[],shapes:[{id:'c',type:'circle',center:{x:0,y:0},radius:100}]},round=scope.F.detect(circle).map(f=>({...f,...scope.F.mesh(f)}));circle.extrusions=[{id:'cyl',faceIds:round.map(f=>f.id),height:3}];assert.equal(scope.E.surfaces(circle,round).filter(s=>s.name==='Ściana').length,0);
});
test('Unit: pictures cannot cover a hole; snapping aligns edges and centers; angle steps reach multiples of 45',()=>{
  const surface={widthCm:400,heightCm:300,rings:[[{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300}],[{x:150,y:100},{x:200,y:100},{x:200,y:150},{x:150,y:150}]]};
  assert.ok(!scope.E.fits(surface,{x:120,y:80,widthCm:100,heightCm:100}));
  const result=scope.E.snap(surface,{id:'a',x:19,y:71,widthCm:80,heightCm:100},[{id:'b',x:20,y:70,widthCm:80,heightCm:100}],[],3);near(result.item.x,20);near(result.item.y,70);
  near(scope.E.step(21*Math.PI/180,1),Math.PI/4);near(scope.E.step(Math.PI/4,1),Math.PI/2);near(scope.E.step(21*Math.PI/180,-1),0);near(scope.E.step(0,-1),-Math.PI/4);
});
test('Unit: editable distances move artwork edges or line endpoints without rotating or resizing images',()=>{
  const E=scope.E,surface={widthCm:400,heightCm:300,rings:[[{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300}]]},data={items:[{id:'a',x:50,y:90,widthCm:80,heightCm:100,depthCm:3},{id:'b',x:200,y:90,widthCm:80,heightCm:100,depthCm:3}],lines:[{id:'l',a:{x:20,y:220},b:{x:350,y:220}}],guides:[],dimensions:[]};
  const gap={axis:'x',a:{kind:'item',id:'a',edge:'right'},b:{kind:'item',id:'b',edge:'left'}};
  const changed=E.setDistance(surface,data,gap,20);assert.ok(changed);near(changed.items[1].x,150);near(changed.items[1].y,90);near(E.measurement(surface,changed,gap).value,20);assert.equal(changed.items[1].widthCm,80);assert.equal(data.items[1].x,200);
  const right={axis:'x',a:{kind:'wall',edge:'right'},b:{kind:'item',id:'b',edge:'right'}};near(E.setDistance(surface,data,right,10).items[1].x,310);assert.equal(E.setDistance(surface,data,gap,250),null,'Distance outside the wall is rejected');
  const length={axis:'x',a:{kind:'line',id:'l',edge:'a'},b:{kind:'line',id:'l',edge:'b'}};const shortened=E.setDistance(surface,data,length,200);near(shortened.lines[0].b.x,220);near(shortened.lines[0].b.y,220);
  const elevation={axis:'y',a:{kind:'wall',edge:'bottom'},b:{kind:'line',id:'l',edge:'a'}};const lowered=E.setDistance(surface,data,elevation,180);near(lowered.lines[0].a.y,180);near(lowered.lines[0].b.y,180);
});
test('Unit: line spacing is attached to both lines and placeholder dimensions resize only the placeholder',()=>{
  const E=scope.E,surface={widthCm:400,heightCm:300,rings:[[{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300}]]},data={items:[{id:'p',kind:'placeholder',x:50,y:30,widthCm:80,heightCm:100,depthCm:3}],lines:[{id:'a',a:{x:20,y:150},b:{x:350,y:150}},{id:'b',a:{x:20,y:240},b:{x:350,y:240}}],guides:[],dimensions:[]};
  const gap={axis:'y',a:{kind:'line',id:'a',edge:'a'},b:{kind:'line',id:'b',edge:'a'}};const moved=E.setDistance(surface,data,gap,40);near(moved.lines[1].a.y,190);near(moved.lines[1].b.y,190);
  const pictureGap={axis:'y',a:{kind:'line',id:'a',edge:'a'},b:{kind:'item',id:'p',edge:'top'}};const shifted=E.setDistance(surface,data,pictureGap,30);near(shifted.items[0].y,20);near(E.measurement(surface,shifted,pictureGap).value,30);
  const size={axis:'x',a:{kind:'item',id:'p',edge:'left'},b:{kind:'item',id:'p',edge:'right'},resize:'widthCm'};const resized=E.setDistance(surface,data,size,120);assert.ok(resized);near(resized.items[0].widthCm,120);near(resized.items[0].x,50);assert.equal(E.setDistance(surface,data,size,380),null);
  assert.equal(E.attached({a:{kind:'point',x:3,y:4},b:{kind:'wall',edge:'left'}}),false);assert.equal(E.attached(gap),true);
});
async function clickWall(page,fraction=.5,double=false){
  await renderValues(page.locator('#plan-orbit'));
  const point=await page.evaluate(async fraction=>{
    const g=await new Promise((resolve,reject)=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).outline);};};});
    const canvas=document.querySelector('#plan-orbit'),gl=canvas.getContext('webgl2'),program=gl.getParameter(gl.CURRENT_PROGRAM),matrix=gl.getUniform(program,gl.getUniformLocation(program,'matrix')),rect=canvas.getBoundingClientRect();
    const faces=PlanFaces.detect(g).map(face=>({...face,...PlanFaces.mesh(face)})),surfaces=PlanExhibition.surfaces(g,faces);
    const project=p=>{const v=[p.x,p.y,p.height||0,1],q=[0,0,0,0];for(let row=0;row<4;row++)for(let col=0;col<4;col++)q[row]+=matrix[col*4+row]*v[col];return{x:(q[0]/q[3]+1)*rect.width/2,y:(1-q[1]/q[3])*rect.height/2};};
    const candidates=surfaces.map(surface=>{const points=surface.rings[0].map(p=>project(PlanExhibition.world(surface,p.x,p.y))),area=Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;return{surface,area,points,center:project(PlanExhibition.world(surface,surface.widthCm/2,surface.heightCm/2))};}).filter(c=>c.area>16&&c.center.x>0&&c.center.x<rect.width&&c.center.y>0&&c.center.y<rect.height);
    const visible=candidates.filter(candidate=>{const ray=PlanExhibition.ray(matrix,candidate.center.x,candidate.center.y,rect.width,rect.height);if(!ray)return false;let nearest=Infinity,hit=null;
      for(const surface of surfaces){const n=[surface.normal.x,surface.normal.y,surface.normal.height||0],origin=[surface.origin.x,surface.origin.y,surface.origin.height||0],den=n.reduce((sum,v,i)=>sum+v*ray.direction[i],0);if(Math.abs(den)<1e-10)continue;const t=n.reduce((sum,v,i)=>sum+v*(origin[i]-ray.origin[i]),0)/den;if(t<0||t>=nearest)continue;const p={x:ray.origin[0]+t*ray.direction[0],y:ray.origin[1]+t*ray.direction[1],height:ray.origin[2]+t*ray.direction[2]};if(PlanExhibition.contains(surface,PlanExhibition.local(surface,p))){nearest=t;hit=surface.id;}}
      return hit===candidate.surface.id;
    });if(!visible.length)throw Error('No visible wall surface for pointer click');const points=visible.flatMap(c=>c.points),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),y=visible.reduce((sum,c)=>sum+c.center.y,0)/visible.length,x=minX+(maxX-minX)*fraction;visible.sort((a,b)=>Math.hypot(a.center.x-x,a.center.y-y)-Math.hypot(b.center.x-x,b.center.y-y));return{x:rect.x+visible[0].center.x,y:rect.y+visible[0].center.y};
  },fraction);
  if(double)await page.mouse.dblclick(point.x,point.y);else await page.mouse.click(point.x,point.y);
}
async function wallPoint(page,x,y){return page.locator('#exhibition-wall').evaluate((svg,p)=>{const q=new DOMPoint(p.x,Number(svg.dataset.heightCm)-p.y).matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};},{x,y});}
async function openFlatWall(page,x,y,bounds){
  if(await page.locator('#plan-orbit-toggle').getAttribute('aria-pressed')!=='true')await require('./cad-test-helpers.cjs').toggleView(page);
  if(await page.locator('#view-mode-walls').getAttribute('aria-pressed')!=='true')await page.locator('#view-mode-walls').click();
  await page.locator('[data-orbit-plane="xy"]').press('Enter');await page.locator('#plan-zoom-reset').click();await clickXY(page,x,y,false,bounds);await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-editor').isHidden());await page.locator('#view-mode-layout').click();
}

test('E2E: wall selection uses bottom sheet tabs, keeps the active wall and supports keyboard navigation',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[400,600]]);await draw('rectangle',[[450,350],[650,600]]);const bounds={minX:200,minY:350,maxX:650,maxY:600};
  await openFlatWall(page,300,475,bounds);await page.locator('#view-mode-walls').click();await openFlatWall(page,550,475,bounds);
  const tabs=page.getByRole('tablist',{name:'Ściany ekspozycji'}),buttons=tabs.getByRole('tab');assert.equal(await buttons.count(),2);const bar=await page.locator('#wall-tabs-bar').boundingBox();assert.ok(bar.y>1100&&bar.y+bar.height<=1200,'Wall tabs sit at the bottom of the viewport');assert.equal(await page.locator('.header #plan-wall-list,.header #exhibition-wall-list').count(),0);
  for(const width of [1500,768]){await page.setViewportSize({width,height:1200});for(const id of ['wall-previous','wall-next','wall-picker-toggle']){const box=await page.locator('#'+id).boundingBox();near(box.width,box.height);near(box.width,32);}}await page.setViewportSize({width:1500,height:1200});
  await buttons.first().click();assert.equal(await buttons.first().getAttribute('aria-selected'),'true');const first=await page.locator('#exhibition-wall').getAttribute('data-surface-id');await page.locator('#exhibition-placeholder').click();for(const p of [[20,30],[60,80]]){const q=await wallPoint(page,...p);await page.mouse.click(q.x,q.y);}const artX=await page.locator('[data-placement-id] rect').getAttribute('x');await buttons.first().press('ArrowRight');assert.equal(await buttons.last().getAttribute('aria-selected'),'true');assert.notEqual(await page.locator('#exhibition-wall').getAttribute('data-surface-id'),first);await buttons.first().click();assert.equal(await page.locator('[data-placement-id] rect').getAttribute('x'),artX,'Arrow navigation must not move the selected artwork');await buttons.last().click();
  await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await buttons.last().getAttribute('aria-selected'),'true');
  assert.ok(await page.locator('#wall-next').isDisabled());await page.locator('#wall-previous').click();assert.equal(await buttons.first().getAttribute('aria-selected'),'true');assert.ok(await page.locator('#wall-previous').isDisabled());await page.locator('#wall-next').click();assert.equal(await buttons.last().getAttribute('aria-selected'),'true');
  await page.locator('#wall-picker-toggle').click();const picker=page.locator('#wall-picker');assert.ok(await picker.isVisible());assert.equal(await picker.getByRole('menuitemradio').count(),2);await picker.getByRole('menuitemradio').first().click();assert.ok(await picker.isHidden());assert.equal(await buttons.first().getAttribute('aria-selected'),'true');assert.equal(await page.locator('#exhibition-wall').getAttribute('data-surface-id'),first);
  await page.locator('#wall-picker-toggle').click();await page.keyboard.press('Escape');assert.ok(await picker.isHidden(),'Escape dismisses the wall list');
  assert.equal(await page.locator('#wall-details-toggle').count(),0);const originalName=await buttons.first().textContent();await buttons.first().dblclick();const rename=page.getByRole('textbox',{name:'Nazwa układu'});assert.ok((await rename.boundingBox()).y>1100);await rename.fill('Anulowana');await rename.press('Escape');assert.equal(await buttons.first().textContent(),originalName);await buttons.first().dblclick();await rename.fill('Sala główna');await rename.press('Enter');assert.equal(await buttons.first().textContent(),'Sala główna');await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await buttons.first().textContent(),'Sala główna');
 });}finally{await browser.close();}
});

test('E2E: row chains join corresponding edges outside the wall, with widths in a separate lane',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[600,600]]);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});
  for(const [x,y]of [[40,150],[220,150],[80,20],[200,65]]){await page.locator('#exhibition-placeholder').click();for(const p of [[x,y],[x+60,y+40]]){const q=await wallPoint(page,...p);await page.mouse.click(q.x,q.y);}}
  await page.keyboard.press('Escape');const verify=async()=>{const rows=await page.locator('[data-auto-dimension][data-dimension-item][data-dimension-axis="x"]').evaluateAll(nodes=>nodes.map(e=>{const line=e.querySelector('.exhibition-dimension-main'),pad=e.dataset.dimensionConfined==='true'?0:7/e.ownerSVGElement.getScreenCTM().a;return{width:e.dataset.autoDimension.endsWith('width'),offset:Number(e.dataset.dimensionOffset),from:Math.min(Number(line.getAttribute('x1')),Number(line.getAttribute('x2')))+pad,to:Math.max(Number(line.getAttribute('x1')),Number(line.getAttribute('x2')))-pad,value:Number(e.dataset.dimensionValue)};}));
   for(const lower of [false,true]){const band=rows.filter(d=>lower?d.offset<0:d.offset>250),row=band.filter(d=>!d.width).sort((a,b)=>a.from-b.from),widths=band.filter(d=>d.width);assert.equal(row.length,3);assert.equal(widths.length,2);for(const width of widths){near(width.value,60);assert.ok(Math.abs(width.offset)<Math.abs(row[0].offset));}const anchors=lower?[0,140,260,400]:[0,40,220,400];for(let i=0;i<row.length;i++){near(row[i].from,anchors[i]);near(row[i].to,anchors[i+1]);}near(row.reduce((sum,d)=>sum+d.value,0),400);for(let i=1;i<row.length;i++)near(row[i-1].to,row[i].from);}
  };await verify();await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});await verify();
 });}finally{await browser.close();}
});

test('E2E: a dimension follows free dragging into the wall and returns exactly to its original position',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[600,600]]);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});await page.locator('#exhibition-placeholder').click();for(const p of [[80,70],[160,140]]){const q=await wallPoint(page,...p);await page.mouse.click(q.x,q.y);}await page.keyboard.press('Escape');
  const dimension=page.locator('[data-auto-dimension="placeholder-width"]'),label=dimension.locator('.exhibition-dimension-value'),box=await label.boundingBox(),initial=Number(await dimension.getAttribute('data-dimension-offset')),view=await page.locator('#exhibition-wall').getAttribute('viewBox'),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+100,{steps:8});
  assert.ok(Number(await dimension.getAttribute('data-dimension-offset'))<250,'Manual placement can cross the automatic top boundary');assert.equal(await page.locator('#exhibition-wall').getAttribute('viewBox'),view,'The viewport stays fixed during dimension dragging');const moved=await label.boundingBox();near(moved.y,box.y+100);
  await page.mouse.move(x,y,{steps:8});near(Number(await dimension.getAttribute('data-dimension-offset')),initial);const returned=await label.boundingBox();near(returned.y,box.y);await page.mouse.up();
  await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});near(Number(await dimension.getAttribute('data-dimension-offset')),initial);
  const vertical=page.locator('[data-auto-dimension="top"] .exhibition-dimension-value'),verticalBox=await vertical.boundingBox(),vx=verticalBox.x+verticalBox.width/2,vy=verticalBox.y+verticalBox.height/2;
  await page.mouse.move(vx,vy);await page.mouse.down();await page.mouse.move(vx-80,vy,{steps:8});const shifted=await vertical.boundingBox();near(shifted.x,verticalBox.x-80);await page.mouse.move(vx,vy,{steps:8});near((await vertical.boundingBox()).x,verticalBox.x);await page.mouse.up();
  const fresh=await label.boundingBox(),fx=fresh.x+fresh.width/2,fy=fresh.y+fresh.height/2;await page.mouse.move(fx,fy);await page.mouse.down();await page.mouse.move(fx,fy+100,{steps:8});assert.ok(Number(await dimension.getAttribute('data-dimension-offset'))<250);await page.mouse.up();assert.ok(Number(await dimension.getAttribute('data-dimension-offset'))>250,'Released horizontal dimensions return outside the wall');
 });}finally{await browser.close();}
});

test('E2E: lower-row artwork dimensions stay below the wall while upper-row dimensions stay above',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[600,600]]);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});
  for(const [x,y]of [[40,150],[220,150],[130,30]]){await page.locator('#exhibition-placeholder').click();for(const p of [[x,y],[x+60,y+60]]){const q=await wallPoint(page,...p);await page.mouse.click(q.x,q.y);}}
  await page.keyboard.press('Escape');const ids=await page.locator('[data-placement-id]').evaluateAll(nodes=>nodes.map(e=>e.dataset.placementId)),h=Number(await page.locator('#exhibition-wall').getAttribute('data-height-cm'));
  const verify=async()=>{for(const [index,id]of ids.entries()){const offsets=await page.locator(`[data-dimension-item="${id}"][data-dimension-axis="x"]`).evaluateAll(nodes=>nodes.map(e=>Number(e.dataset.dimensionOffset)));assert.ok(offsets.length>=2);for(const offset of offsets)assert.ok(index===2?offset<0:offset>h,'Dimension placement follows the artwork row');}assert.ok(Number(await page.locator('[data-wall-dimension="width"]').getAttribute('data-dimension-offset'))>h);};
  await verify();await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});await verify();
 });}finally{await browser.close();}
});

test('E2E: vertical spacing between two artworks draws entirely between their edges',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[600,600]]);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});
  for(const [x,y]of [[20,150],[70,30]]){await page.locator('#exhibition-placeholder').click();for(const p of [[x,y],[x+60,y+60]]){const q=await wallPoint(page,...p);await page.mouse.click(q.x,q.y);}}
  await page.keyboard.press('Escape');const gap=page.locator('[data-dimension-confined="true"][data-dimension-axis="y"]');assert.equal(await gap.count(),1);
  const geometry=await gap.evaluate(e=>({value:Number(e.dataset.dimensionValue),line:[...e.querySelectorAll('line')].map(l=>({y1:Number(l.getAttribute('y1')),y2:Number(l.getAttribute('y2')),main:l.classList.contains('exhibition-dimension-main')}))}));
  const main=geometry.line.find(l=>l.main),min=Math.min(main.y1,main.y2),max=Math.max(main.y1,main.y2);near(max-min,geometry.value);const offset=Number(await gap.getAttribute('data-dimension-offset'));near(offset,75);assert.equal(await gap.locator('.exhibition-dimension-extension').count(),0,'The vertical dimension directly joins both artwork edges');
  for(const line of geometry.line)assert.ok(line.y1>=min-1e-6&&line.y1<=max+1e-6&&line.y2>=min-1e-6&&line.y2<=max+1e-6,'No dimension line or tick projects into either artwork');
 });}finally{await browser.close();}
});

test('E2E: dragging across artwork alignments keeps artwork nodes and the viewport stable with all dimensions visible',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[600,600]]);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});
  for(const [x,y]of [[30,140],[140,140],[250,140],[90,30]]){await page.locator('#exhibition-placeholder').click();for(const p of [[x,y],[x+60,y+70]]){const q=await wallPoint(page,...p);await page.mouse.click(q.x,q.y);}}
  await page.keyboard.press('Escape');const a=await wallPoint(page,120,65);await page.mouse.move(a.x,a.y);await page.mouse.down();
  await page.evaluate(()=>{const svg=document.querySelector('#exhibition-wall');window.__dragProfile={moves:[],ctm:0,bbox:0,rebuilds:0,viewBox:svg.getAttribute('viewBox'),nodes:[...svg.querySelectorAll('[data-placement-id]')]};for(const [name,key]of [['getScreenCTM','ctm'],['getBBox','bbox'],['replaceChildren','rebuilds']]){const original=svg[name].bind(svg);svg[name]=(...args)=>{window.__dragProfile[key]++;return original(...args);};}let start;document.addEventListener('pointermove',()=>{start=performance.now();},true);document.addEventListener('pointermove',()=>window.__dragProfile.moves.push(performance.now()-start));});
  const b=await wallPoint(page,300,65);await page.mouse.move(b.x,b.y,{steps:24});
  const profile=await page.evaluate(()=>{const svg=document.querySelector('#exhibition-wall'),p=window.__dragProfile;return{moves:p.moves,ctm:p.ctm,bbox:p.bbox,rebuilds:p.rebuilds,stableNodes:p.nodes.every(e=>e.isConnected),stableView:svg.getAttribute('viewBox')===p.viewBox,dimensions:svg.querySelectorAll('.exhibition-dimension').length};});
  console.log('Artwork drag profile:',JSON.stringify(profile));assert.ok(profile.moves.length>=20);assert.ok(profile.stableNodes,'Dragging must preserve existing artwork SVG nodes');assert.ok(profile.stableView,'Dragging must keep the wall viewport fixed');assert.ok(profile.dimensions>10,'Dimensions remain visible while dragging');assert.equal(profile.rebuilds,0);assert.equal(profile.bbox,0);assert.ok(profile.ctm<=profile.moves.length*5+5,'Dragging performs a bounded number of layout reads per input event');
  assert.ok(await page.locator('[data-placement-id]').last().evaluate(e=>e.transform.baseVal.consolidate().matrix.e)>150,'The preserved artwork node actually moves');
  await page.mouse.up();const moved=await page.locator('[data-placement-id]').last().getAttribute('data-placement-id');near(Number(await page.locator(`[data-placement-id="${moved}"] rect`).getAttribute('x')),270);await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await page.locator(`[data-placement-id="${moved}"]`).count(),1);near(Number(await page.locator(`[data-placement-id="${moved}"] rect`).getAttribute('x')),270);
 });}finally{await browser.close();}
});

test('E2E: one guide tool previews and draws horizontal and vertical lines and preserves them after reload',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[600,600]]);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});
  for(const [start,end,vertical]of [[[30,40],[180,60],false],[[220,20],[230,180],true]]){
   await page.locator('#exhibition-line').click();const a=await wallPoint(page,...start);await page.mouse.click(a.x,a.y);const b=await wallPoint(page,...end);await page.mouse.move(b.x,b.y);const preview=page.locator('.exhibition-line-preview');await preview.waitFor({state:'attached'});
   const axis=vertical?'x':'y';near(Number(await preview.getAttribute(`${axis}1`)),Number(await preview.getAttribute(`${axis}2`)));
   const target=await wallPoint(page,...end);await page.mouse.click(target.x,target.y);
  }
  const verify=async()=>{const lines=await page.locator('.exhibition-line-visible').evaluateAll(nodes=>nodes.map(e=>({x1:Number(e.getAttribute('x1')),x2:Number(e.getAttribute('x2')),y1:Number(e.getAttribute('y1')),y2:Number(e.getAttribute('y2'))})));assert.equal(lines.length,2);near(lines[0].y1,lines[0].y2);assert.ok(Math.abs(lines[0].x2-lines[0].x1)>100);near(lines[1].x1,lines[1].x2);assert.ok(Math.abs(lines[1].y2-lines[1].y1)>100);};
  await verify();await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});await verify();
 });}finally{await browser.close();}
});

test('E2E: all artwork dimensions remain visible without selection, in other tools and after reload, with labels inside the viewport',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  await draw('rectangle',[[200,350],[600,600]]);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});
  for(const [x,y]of [[40,40],[220,100]]){await page.locator('#exhibition-placeholder').click();for(const p of [[x,y],[x+60,y+70]]){const q=await wallPoint(page,...p);await page.mouse.click(q.x,q.y);}}
  await page.keyboard.press('Escape');
  const verify=async()=>{assert.equal(await page.locator('[data-auto-dimension][data-dimension-item]').count(),12);const labels=await page.locator('.exhibition-dimension').evaluateAll(nodes=>nodes.map(e=>{const line=e.querySelector('.exhibition-dimension-main'),label=e.querySelector(':scope > g'),position=label.transform.baseVal.consolidate().matrix;return{axis:e.dataset.dimensionAxis,x:position.e,y:position.f,lineX:Number(line.getAttribute('x1')),lineY:Number(line.getAttribute('y1'))};}));for(const label of labels)assert.ok(label.axis==='x'?label.y<label.lineY:label.x<label.lineX,'Dimension labels always sit above the oriented dimension line');const viewport=await page.locator('#exhibition-wall').boundingBox();const boxes=await page.locator('.exhibition-dimension text').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON()));assert.ok(boxes.length>=14);for(const b of boxes)assert.ok(b.x>=viewport.x-1&&b.y>=viewport.y-1&&b.right<=viewport.x+viewport.width+1&&b.bottom<=viewport.y+viewport.height+1,'Every dimension label fits the visible wall viewport');};
  const dimensions=await page.locator('.exhibition-dimension').evaluateAll(nodes=>nodes.map(e=>({key:e.dataset.dimensionKey,axis:e.dataset.dimensionAxis,offset:Number(e.dataset.dimensionOffset)})));assert.equal(new Set(dimensions.map(d=>d.key)).size,dimensions.length);const h=Number(await page.locator('#exhibition-wall').getAttribute('data-height-cm'));for(const d of dimensions.filter(d=>d.axis==='x'))assert.ok(d.offset>h||d.offset<0,'Every horizontal dimension is outside the wall in its row');await verify();await page.locator('#exhibition-measure-x').click();await verify();await page.keyboard.press('Escape');await page.locator('[data-placement-id]').first().click();await verify();
  await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});await verify();await page.setViewportSize({width:768,height:800});await verify();
 });}finally{await browser.close();}
});
test('E2E: only designated walls are listed; multiple coplanar blocks become one wall with a cross-seam artwork',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    page.setDefaultTimeout(6000);await draw('rectangle',[[200,350],[400,600]]);await draw('rectangle',[[400,350],[600,600]]);await require('./cad-test-helpers.cjs').toggleView(page);assert.equal(await page.locator('#wall-tabs button').count(),0);
    await page.locator('#plan-faces').click();await clickXY(page,300,475,false,{minX:200,minY:350,maxX:600,maxY:600});await clickXY(page,500,475,true,{minX:200,minY:350,maxX:600,maxY:600});await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('300');await page.locator('#extrude-height').press('Enter');
    await page.locator('#view-mode-walls').click();await page.locator('[data-orbit-plane="xz"]').press('Enter');await page.locator('#plan-zoom-reset').click();await clickWall(page,.25);
    assert.ok(await page.locator('#exhibition-confirm').isVisible());
    await page.locator('#view-mode-2d').click();assert.ok(await page.locator('#exhibition-confirm').isHidden(),'Leaving wall selection closes confirmation in 2D');
    await page.locator('#view-mode-walls').click();assert.ok(await page.locator('#exhibition-confirm').isHidden());assert.equal(await page.locator('#plan-orbit').getAttribute('data-selected-wall-part-count'),'0');
    await clickWall(page,.25);await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-editor').isHidden());await page.locator('#view-mode-layout').click();assert.equal(await page.locator('#view-mode-layout').getAttribute('aria-pressed'),'true');await page.locator('#view-mode-walls').click();assert.ok(await page.locator('#exhibition-editor').isHidden());await clickWall(page,.25,true);assert.ok(await page.locator('#exhibition-editor').isVisible());assert.equal(await page.locator('#view-mode-layout').getAttribute('aria-pressed'),'true');
    await page.locator('#exhibition-placeholder').click();const oldA=await wallPoint(page,40,50),oldB=await wallPoint(page,100,110);await page.mouse.move(oldA.x,oldA.y);await page.mouse.down();await page.mouse.move(oldB.x,oldB.y,{steps:8});await page.mouse.up();const existingWork=await page.locator('[data-placement-id]').getAttribute('data-placement-id');await page.locator('#view-mode-walls').click();assert.equal(await page.locator('#wall-tabs button').count(),1);
    await page.locator('#view-mode-walls').click();await clickWall(page,.25);assert.ok(await page.locator('#exhibition-editor').isHidden());await clickWall(page,.75);await page.waitForFunction(()=>document.querySelector('#plan-orbit').dataset.selectedWallPartCount==='2');assert.ok(await page.locator('#exhibition-editor').isHidden());await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-editor').isHidden());await page.locator('#view-mode-layout').click();
    near(Number(await page.locator('#exhibition-wall').getAttribute('data-width-cm')),400);near(Number(await page.locator('#exhibition-wall').getAttribute('data-height-cm')),300);assert.equal(await page.locator('#wall-tabs button').count(),1);
    assert.equal(await page.locator('[data-placement-id]').getAttribute('data-placement-id'),existingWork);near(Number(await page.locator('[data-placement-id] rect').getAttribute('x')),40);
    await page.locator('#exhibition-placeholder').click();const a=await wallPoint(page,160,70),b=await wallPoint(page,240,170);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();assert.equal(await page.locator('[data-placement-id]').count(),2);
    await renameWall(page,'Długa ściana');await page.locator('#view-mode-walls').click();assert.equal(await page.locator('#wall-tabs button').count(),1);await page.locator('#wall-tabs button').first().click();assert.equal(await page.locator('[data-placement-id]').count(),2);
    await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await page.locator('#wall-tabs [aria-selected=true]').textContent(),'Długa ściana');assert.equal(await page.locator('#wall-tabs button').count(),1);assert.equal(await page.locator('[data-placement-id]').count(),2);assert.equal((await read()).extrusions[0].height,3);
  });}finally{await browser.close();}
});
test('E2E: named wall list, attached line and wall distances, drawing and resizing a placeholder persist after reload',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw})=>{
    page.setDefaultTimeout(6000);await draw('rectangle',[[200,350],[600,600]]);await draw('rectangle',[[650,400],[800,550]]);await require('./cad-test-helpers.cjs').toggleView(page);
    const wallList=page.locator('#wall-tabs');assert.equal(await wallList.locator('button').count(),0,'Unselected surfaces are absent from the wall list');await openFlatWall(page,400,475,{minX:200,minY:350,maxX:800,maxY:600});await page.locator('#exhibition-editor').waitFor({state:'visible'});
    const id=await page.locator('#exhibition-wall').getAttribute('data-surface-id'),data=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).exhibition);};};}));
    for(const select of ['#wall-tabs'])assert.equal(await page.locator(`${select} button`).last().textContent(),'Ściana 1');
    await renameWall(page,'Sala A');assert.equal((await data()).surfaces[id].name,'Sala A');
    for(const select of ['#wall-tabs'])assert.equal(await page.locator(`${select} button`).last().textContent(),'Sala A');
    await page.locator('#exhibition-measure-y').click();for(const [x,y]of [[100,60],[200,80]]){const p=await wallPoint(page,x,y);await page.mouse.click(p.x,p.y);}assert.equal(await page.locator('[data-dimension-id]').count(),0,'Blank clicks cannot create floating measurements');
    await page.locator('#exhibition-line').click();for(const [x,y]of [[20,150],[350,150],[20,220],[350,220]]){const p=await wallPoint(page,x,y);await page.mouse.click(p.x,p.y);}
    await page.locator('#exhibition-measure-y').click();for(const y of [150,220]){const p=await wallPoint(page,180,y);await page.mouse.click(p.x,p.y);}await page.locator('[data-dimension-id] .exhibition-dimension-value').click();await page.locator('#exhibition-distance').fill('40.4');await page.locator('#exhibition-distance').press('Enter');let layout=(await data()).surfaces[id];near(layout.lines[1].a.y-layout.lines[0].a.y,40.4);assert.ok(layout.dimensions.every(d=>d.a.kind==='line'&&d.b.kind==='line'));assert.equal(await page.locator('[data-dimension-id] text').textContent(),'40,4');assert.match(await page.locator('[data-wall-dimension="width"]').textContent(),/cm/);
    await page.locator('[data-dimension-id] .exhibition-dimension-value').click();assert.equal(await page.locator('#exhibition-distance').inputValue(),'40.4');assert.equal(await page.locator('#exhibition-dimension-editor').textContent(),'✓');await page.locator('#exhibition-distance').press('Enter');
    const beforeDimensionDrag=await data(),dimensionLabel=page.locator('[data-dimension-id] .exhibition-dimension-value'),labelBox=await dimensionLabel.boundingBox();await page.mouse.move(labelBox.x+labelBox.width/2,labelBox.y+labelBox.height/2);await page.mouse.down();await page.mouse.move(labelBox.x+labelBox.width/2+80,labelBox.y+labelBox.height/2,{steps:8});await page.mouse.up();assert.ok(await page.locator('#exhibition-dimension-editor').isHidden(),'Dragging a dimension must not open editing');const afterDimensionDrag=await data();assert.deepEqual(afterDimensionDrag.surfaces[id].lines,beforeDimensionDrag.surfaces[id].lines);assert.deepEqual(afterDimensionDrag.surfaces[id].items,beforeDimensionDrag.surfaces[id].items);assert.notDeepEqual(afterDimensionDrag,beforeDimensionDrag,'Dimension position is saved');await page.locator('#exhibition-undo').click();assert.deepEqual(await data(),beforeDimensionDrag);await page.locator('#exhibition-redo').click();assert.deepEqual(await data(),afterDimensionDrag);
    await page.locator('#exhibition-placeholder').click();const a=await wallPoint(page,50,30),b=await wallPoint(page,130,130);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();layout=(await data()).surfaces[id];assert.equal(layout.items.length,1);assert.equal(layout.items[0].kind,'placeholder');near(layout.items[0].widthCm,80);near(layout.items[0].heightCm,100);
    await page.locator('[data-auto-dimension="placeholder-width"] .exhibition-dimension-value').click();await page.locator('#exhibition-distance').fill('100');await page.locator('#exhibition-distance').press('Enter');near((await data()).surfaces[id].items[0].widthCm,100);
    const autoDimension=page.locator('[data-auto-dimension="placeholder-width"] .exhibition-dimension-value'),autoBox=await autoDimension.boundingBox(),beforeAutoDrag=(await data()).surfaces[id].items[0],beforeAutoOffset=Number(await autoDimension.locator('..').getAttribute('data-dimension-offset')),beforeAutoScale=await page.locator('#exhibition-wall').evaluate(e=>e.getScreenCTM().a);await page.mouse.move(autoBox.x+autoBox.width/2,autoBox.y+autoBox.height/2);await page.mouse.down();await page.mouse.move(autoBox.x+autoBox.width/2,autoBox.y+autoBox.height/2-65,{steps:8});await page.mouse.up();assert.ok(await page.locator('#exhibition-dimension-editor').isHidden());assert.deepEqual((await data()).surfaces[id].items[0],beforeAutoDrag);const autoMoved=await autoDimension.boundingBox();const movedOffset=Number(await autoDimension.locator('..').getAttribute('data-dimension-offset'));assert.ok((movedOffset-beforeAutoOffset)*beforeAutoScale>40,'Dragging changes the annotation position relative to the wall');assert.ok(Number(await page.locator('[data-wall-dimension="width"]').getAttribute('data-dimension-offset'))>movedOffset,'Overall wall dimension remains above the moved label');
    const beforeCancel=await data();await page.mouse.move(autoMoved.x+autoMoved.width/2,autoMoved.y+autoMoved.height/2);await page.mouse.down();await page.mouse.move(autoMoved.x+autoMoved.width/2,autoMoved.y+autoMoved.height/2+50,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await data(),beforeCancel);await page.locator('[data-placement-id]').click();const restoredAuto=await autoDimension.boundingBox();near(restoredAuto.y,autoMoved.y);
    await page.locator('[data-auto-dimension="left"] .exhibition-dimension-value').click();await page.locator('#exhibition-distance').fill('25');await page.locator('#exhibition-distance').press('Enter');near((await data()).surfaces[id].items[0].x,25);
    const gapOffset=Number(await page.locator('[data-auto-dimension="left"]').getAttribute('data-dimension-offset')),wallHeight=Number(await page.locator('#exhibition-wall').getAttribute('data-height-cm')),overallOffset=Number(await page.locator('[data-wall-dimension="width"]').getAttribute('data-dimension-offset'));
    assert.ok(gapOffset>wallHeight&&gapOffset<overallOffset,'Artwork spacing belongs above the wall and below its overall width');
    await page.locator('#exhibition-undo').click();near((await data()).surfaces[id].items[0].x,50);await page.locator('#exhibition-redo').click();near((await data()).surfaces[id].items[0].x,25);
    const form=page.locator('#exhibition-properties');await form.locator('[name="placeholderTitle"]').fill('Makieta');await form.locator('[name="placeholderWidthCm"]').fill('120');await form.locator('[name="placeholderHeightCm"]').fill('90');await form.getByRole('button',{name:'Ustaw pozycję',exact:true}).click();layout=(await data()).surfaces[id];assert.equal(layout.items[0].title,'Makieta');near(layout.items[0].widthCm,120);near(layout.items[0].heightCm,90);
    await page.locator('#view-mode-walls').click();await openFlatWall(page,725,475,{minX:200,minY:350,maxX:800,maxY:600});assert.equal(await page.locator('[data-placement-id]').count(),0);await renameWall(page,'Sala B');await page.locator(`#wall-tabs [data-wall-id="${id}"]`).click();assert.equal(await page.locator('#wall-tabs [aria-selected=true]').textContent(),'Sala A');assert.equal(await page.locator('[data-placement-id]').count(),1);
    await page.locator('#view-mode-walls').click();assert.match(await wallList.locator('button').evaluateAll((options,id)=>options.find(o=>o.dataset.wallId===id).textContent,id),/Sala A/);await renderValues(page.locator('#plan-orbit'));
    const visible=await page.locator('#plan-orbit').evaluate(canvas=>{const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-217*(PlanLighting.ambient([0,0,1])+.4*PlanLighting.direction[2]))<2&&Math.abs(pixels[i+1]-pixels[i])<1.5&&Math.abs(pixels[i+2]-pixels[i])<1.5)count++;return count;});assert.ok(visible>100,'Placeholder is visible on the 3D model');await wallList.locator(`[data-wall-id="${id}"]`).click();assert.equal(await page.locator('[data-placement-id]').count(),1);
    const retained=await data();await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await page.locator('#wall-tabs [aria-selected=true]').textContent(),'Sala A');assert.deepEqual(await data(),retained);assert.equal(await page.locator('#wall-tabs [aria-selected=true]').getAttribute('data-wall-id'),id);
  });}finally{await browser.close();}
});
test('E2E: confirm a flat wall, drag declared-size artworks, guides, relative spacing, thickness, undo, reload and 3D',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    page.setDefaultTimeout(6000);await page.locator('#library-view-button').click();
    await page.locator('#image-files').setInputFiles({name:'Work 80x100cm.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="red"/></svg>')});
    await page.locator('input[name="title"]').fill('Czerwony');await page.locator('input[name="widthCm"]').fill('80');await page.locator('input[name="heightCm"]').fill('100');await page.locator('.save-image').click();await page.waitForFunction(()=>[...document.querySelectorAll('.save-image')].every(button=>button.hidden&&!button.disabled));await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);
    await page.locator('#image-files').setInputFiles({name:'Blue 80x100cm.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="blue"/></svg>')});const second=page.locator('.image-card:has(input[name=title]:not([readonly]))');await second.locator('[name="title"]').fill('Niebieski');await second.locator('[name="widthCm"]').fill('80');await second.locator('[name="heightCm"]').fill('100');await second.locator('.save-image').click();await page.waitForFunction(()=>[...document.querySelectorAll('.save-image')].every(button=>button.hidden&&!button.disabled));await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);await page.locator('#plan-view-button').click();
    await draw('rectangle',[[200,350],[600,600]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();await clickXY(page,400,475,false,{minX:200,minY:350,maxX:600,maxY:600});await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('300');await page.locator('#extrude-height').press('Enter');
    await page.locator('#view-mode-walls').click();await page.locator('[data-orbit-plane="xz"]').press('Enter');await page.locator('#plan-zoom-reset').click();await clickWall(page);await page.locator('#exhibition-confirm').waitFor({state:'visible'});assert.ok(await page.locator('#exhibition-editor').isHidden());assert.equal(await page.locator('#exhibition-dismiss').count(),0);const confirmation=await page.locator('#exhibition-confirm').boundingBox();assert.ok(confirmation.width<260&&confirmation.height<65,'Confirmation stays compact');await page.keyboard.press('Escape');assert.ok(await page.locator('#exhibition-confirm').isHidden());await clickWall(page);await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-editor').isHidden());await page.locator('#view-mode-layout').click();
    await page.locator('#exhibition-editor').waitFor({state:'visible'});const thumb=page.locator('.exhibition-library-item').first();assert.match(await thumb.textContent(),/80,0 × 100,0/);
    assert.equal(await page.locator('.exhibition-library-hint').count(),0);assert.equal(await page.locator('[name="relation"],[name="reference"]').filter({visible:true}).count(),0);
    assert.match(await page.locator('[data-wall-dimension="width"]').textContent(),/400.*cm/);assert.match(await page.locator('[data-wall-dimension="height"]').textContent(),/300.*cm/);
    const target=await wallPoint(page,100,150),r=await thumb.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});const ghost=await page.locator('#exhibition-drag-preview').boundingBox(),scale=(await wallPoint(page,100,0)).x-(await wallPoint(page,0,0)).x;near(ghost.width,80*scale/100);near(ghost.height,100*scale/100);await page.mouse.up();await page.locator('[data-placement-id]').waitFor();assert.ok(await page.locator('#exhibition-drag-preview').isHidden());
    const surfaceId=await page.locator('#exhibition-wall').getAttribute('data-surface-id');
    const data=()=>page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('exhibition-planner-v2',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).exhibition);};};}));
    let saved=(await data()).surfaces[surfaceId];assert.equal(saved.items[0].widthCm,80);assert.equal(saved.items[0].heightCm,100);assert.equal(saved.items[0].depthCm,3);
    assert.ok(await thumb.isDisabled(),'Placed artwork cannot be added again');assert.match(await thumb.textContent(),/80,0 × 100,0/,'Placed artwork retains its dimensions in the library');
    const duplicateTarget=await wallPoint(page,250,150),blocked=await thumb.boundingBox();await page.mouse.move(blocked.x+blocked.width/2,blocked.y+blocked.height/2);await page.mouse.down();await page.mouse.move(duplicateTarget.x,duplicateTarget.y,{steps:8});await page.mouse.up();assert.equal(await page.locator('[data-placement-id]').count(),1);
    await page.locator('#view-mode-walls').click();await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});assert.ok(await thumb.isDisabled(),'Used artwork is unavailable on other walls');await page.locator(`#wall-tabs [data-wall-id="${surfaceId}"]`).click();
    await page.locator('#view-mode-walls').click();await page.locator('#plan-empty').click();await draw('rectangle',[[200,350],[600,600]]);await require('./cad-test-helpers.cjs').toggleView(page);await openFlatWall(page,400,475,{minX:200,minY:350,maxX:600,maxY:600});assert.ok(await thumb.isDisabled(),'Artwork placed in another plan cannot be reused');await page.locator('#view-mode-walls').click();await page.locator('#plan-list button').first().click();await page.locator('#view-mode-walls').click();await page.locator(`#wall-tabs [data-wall-id="${surfaceId}"]`).click();
    const original=await page.locator('[data-placement-id]').first().getAttribute('data-placement-id');const originalPoint=await wallPoint(page,100,150);await page.mouse.click(originalPoint.x,originalPoint.y);await page.locator('#exhibition-delete').click();assert.ok(await thumb.isEnabled());await page.locator('#exhibition-undo').click();assert.ok(await thumb.isDisabled());assert.equal(await page.locator('[data-placement-id]').getAttribute('data-placement-id'),original);
    await page.locator('.exhibition-library-item').nth(1).click();const p=await wallPoint(page,250,150);await page.mouse.click(p.x,p.y);assert.equal(await page.locator('[data-placement-id]').count(),2);
    const widths=page.locator('[data-auto-dimension="artwork-width"]');assert.equal(await widths.count(),2);for(const width of await widths.evaluateAll(nodes=>nodes.map(e=>Number(e.dataset.dimensionValue))))near(width,80);assert.equal(await widths.locator('.exhibition-dimension-value').count(),0,'Library artwork dimensions are read-only');
    const form=page.locator('#exhibition-properties');await page.locator(`[data-auto-dimension="left"][data-dimension-item="${(await data()).surfaces[surfaceId].items[1].id}"] .exhibition-dimension-value`).click();await page.locator('#exhibition-distance').fill('100');await page.locator('#exhibition-distance').press('Enter');saved=(await data()).surfaces[surfaceId];near(saved.items[1].x-saved.items[0].x-saved.items[0].widthCm,20);near(saved.items[1].y,saved.items[0].y);
    await form.locator('[name="depthCm"]').fill('5');await form.getByRole('button',{name:'Ustaw pozycję',exact:true}).click();assert.equal((await data()).surfaces[surfaceId].items[1].depthCm,5);
    const first=(await data()).surfaces[surfaceId].items[0],start=await wallPoint(page,first.x+40,first.y+50),end=await wallPoint(page,first.x+65,first.y+51);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();const moved=(await data()).surfaces[surfaceId].items[0];assert.ok(moved.x>first.x+10,'Dragging moves a placed image');near(moved.y,first.y,'Snap preserves alignment with the other image');
    await page.locator('#exhibition-undo').click();near((await data()).surfaces[surfaceId].items[0].x,first.x);
    await page.locator('#exhibition-line').click();const a=await wallPoint(page,20,220),b=await wallPoint(page,350,240);await page.mouse.click(a.x,a.y);await page.mouse.click(b.x,b.y);let line=(await data()).surfaces[surfaceId].lines[0];near(line.a.y,line.b.y,'New lines stay horizontal without Shift');assert.equal(line.construction,true);
    await page.locator('#exhibition-wall').focus();await page.keyboard.press('Control+z');assert.equal((await data()).surfaces[surfaceId].lines.length,0);await page.keyboard.press('Control+y');assert.equal((await data()).surfaces[surfaceId].lines.length,1);
    await page.locator('#exhibition-measure-x').click();const lineStart=await wallPoint(page,line.a.x,line.a.y),lineEnd=await wallPoint(page,line.b.x,line.b.y);await page.mouse.click(lineStart.x,lineStart.y);await page.mouse.click(lineEnd.x,lineEnd.y);assert.equal((await data()).surfaces[surfaceId].dimensions.length,1);
    await page.locator('[data-dimension-id] .exhibition-dimension-value').click();await page.locator('#exhibition-distance').fill('200');await page.locator('#exhibition-distance').press('Enter');line=(await data()).surfaces[surfaceId].lines[0];near(line.b.x-line.a.x,200);
    await page.locator('#exhibition-measure-y').click();const floor=await wallPoint(page,10,0),lineMiddle=await wallPoint(page,(line.a.x+line.b.x)/2,line.a.y);await page.mouse.click(floor.x,floor.y);await page.mouse.click(lineMiddle.x,lineMiddle.y);assert.equal((await data()).surfaces[surfaceId].dimensions.length,2);
    await page.locator('[data-dimension-id] .exhibition-dimension-value').last().click();await page.locator('#exhibition-distance').fill('180');await page.locator('#exhibition-distance').press('Enter');line=(await data()).surfaces[surfaceId].lines[0];near(line.a.y,180);near(line.b.y,180);
    assert.equal(await page.locator('#exhibition-construction').count(),0);await page.locator('#exhibition-line').click();const guideA=await wallPoint(page,15,250),guideB=await wallPoint(page,380,260);await page.mouse.click(guideA.x,guideA.y);await page.mouse.click(guideB.x,guideB.y);const helper=(await data()).surfaces[surfaceId].lines[1];assert.ok(helper.construction);near(helper.a.y,helper.b.y);
    const retained=await data();await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await page.locator('[data-placement-id]').count(),2);assert.deepEqual(await data(),retained);assert.ok(await thumb.isDisabled(),'Reload preserves availability of placed artworks');assert.equal(await widths.count(),2,'Artwork widths remain visible after reload without selection');
    await page.locator('#view-mode-walls').click();assert.ok(await page.locator('#plan-orbit').isVisible());assert.equal((await read()).extrusions[0].height,3);
    await page.locator('[data-orbit-plane="xz"]').press('Enter');await page.locator('#plan-zoom-reset').click();await renderValues(page.locator('#plan-orbit'));
    const redPixels=()=>page.locator('#plan-orbit').evaluate(canvas=>{const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<p.length;i+=4)if(p[i]>180&&p[i+1]<60&&p[i+2]<60)count++;return count;});
    assert.ok(await redPixels()>100,'Placed artwork textures are visible on the 3D wall');
    await page.locator('#camera-settings-toggle').click();await page.locator('#orbit-projection').selectOption('perspective');await renderValues(page.locator('#plan-orbit'));assert.ok(await redPixels()>100,'Artwork remains visible in perspective');
  });}finally{await browser.close();}
});
test('E2E: a flat sketch surface can be selected without extrusion',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw})=>{
    await draw('rectangle',[[200,350],[600,600]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#view-mode-walls').click();await clickXY(page,400,475,false,{minX:200,minY:350,maxX:600,maxY:600});await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-editor').isHidden());await page.locator('#view-mode-layout').click();assert.ok(await page.locator('#exhibition-editor').isVisible());assert.match(await page.locator('#wall-tabs [aria-selected=true]').textContent(),/Ściana/);await page.locator('#view-mode-walls').click();assert.ok(await page.locator('#plan-orbit').isVisible());
  });}finally{await browser.close();}
});
test('E2E: perspective differs from axonometry, picks walls and remembers 45-degree camera steps',async()=>{
  const browser=await launch();try{await session(browser,async({page,draw,read})=>{
    page.setDefaultTimeout(6000);await draw('rectangle',[[200,350],[600,600]]);await require('./cad-test-helpers.cjs').toggleView(page);await page.locator('#plan-faces').click();await clickXY(page,400,475,false,{minX:200,minY:350,maxX:600,maxY:600});await page.locator('#plan-extrude').click();await page.locator('#extrude-height').fill('300');await page.locator('#extrude-height').press('Enter');const geometry=await read();
    await page.locator('[data-orbit-plane="xy"]').press('Enter');const r=await page.locator('#plan-orbit').boundingBox(),x=r.x+r.width*.5,y=r.y+r.height*.6;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+21*Math.PI/180/.01,y+50,{steps:8});await page.mouse.up();await renderValues(page.locator('#plan-orbit'));assert.equal(await page.locator('#orbit-step-angle').textContent(),'21°');
    await page.locator('#camera-settings-toggle').click();await page.locator('#orbit-step-next').click();await renderValues(page.locator('#plan-orbit'));assert.equal(await page.locator('#orbit-step-angle').textContent(),'45°');await page.locator('#orbit-step-next').click();await renderValues(page.locator('#plan-orbit'));assert.equal(await page.locator('#orbit-step-angle').textContent(),'90°');await page.locator('#orbit-step-back').click();await renderValues(page.locator('#plan-orbit'));assert.equal(await page.locator('#orbit-step-angle').textContent(),'45°');
    const flat=await renderValues(page.locator('#plan-orbit'));assert.ok(await page.locator('#camera-settings').isVisible());await page.locator('#orbit-projection').selectOption('perspective');const perspective=await renderValues(page.locator('#plan-orbit'));assert.ok(!flat.equals(perspective),'Perspective projection visibly changes the model');
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan-view-button').disabled);assert.equal(await page.locator('#orbit-projection').inputValue(),'perspective');await renderValues(page.locator('#plan-orbit'));assert.equal(await page.locator('#orbit-step-angle').textContent(),'45°');assert.deepEqual(await read(),geometry);
    await page.locator('#view-mode-walls').click();await clickWall(page);await page.locator('#exhibition-confirm').waitFor({state:'visible'});await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-editor').isHidden());await page.locator('#view-mode-layout').click();assert.ok(await page.locator('#exhibition-editor').isVisible());
  });}finally{await browser.close();}
});


test('E2E: wall hover shows a subtle default or custom name and hides on leave, click and mode change',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  page.setDefaultTimeout(6000);await draw('rectangle',[[200,350],[400,600]]);
  await page.locator('#view-mode-walls').click();const bounds={minX:200,minY:350,maxX:400,maxY:600};
  await clickXY(page,300,475,false,bounds);const selected=page.locator('[data-wall-state="candidate-selected"]');await selected.waitFor({state:'visible'});const box=await selected.boundingBox();
  const hover=()=>page.mouse.move(box.x+box.width/2,box.y+box.height/2),label=page.locator('#wall-hover-name');
  await page.keyboard.press('Escape');await hover();assert.ok(await label.isHidden(),'Unnamed candidate is not a saved wall');
  await clickXY(page,300,475,false,bounds);await page.locator('#exhibition-enter').click();await hover();await label.waitFor({state:'visible'});assert.equal(await label.textContent(),'Ściana 1');assert.equal(await label.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  await page.locator('#view-mode-layout').click();assert.ok(await label.isHidden());await renameWall(page,'Sala <A>');await page.locator('#view-mode-walls').click();
  await hover();await label.waitFor({state:'visible'});assert.equal(await label.textContent(),'Sala <A>');assert.equal(await label.locator('*').count(),0);
  const labelBox=await label.boundingBox();assert.ok(labelBox.x>=0&&labelBox.y>=0&&labelBox.x+labelBox.width<=1500&&labelBox.y+labelBox.height<=1200);
  await page.mouse.move(1,1);assert.ok(await label.isHidden());await hover();await label.waitFor({state:'visible'});await page.mouse.down();assert.ok(await label.isHidden());await page.mouse.up();
  await page.locator('#view-mode-2d').click();assert.ok(await label.isHidden());
 });}finally{await browser.close();}
});

test('E2E: wall candidates are green, existing hover is blue and individual parts can be removed and added without losing artworks',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw,read})=>{
  page.setDefaultTimeout(6000);await draw('rectangle',[[200,350],[400,600]]);await draw('rectangle',[[400,350],[600,600]]);
  await page.locator('#view-mode-walls').click();await page.locator('[data-orbit-plane="xy"]').press('Enter');await page.locator('#plan-zoom-reset').click();
  const bounds={minX:200,minY:350,maxX:600,maxY:600};
  await clickXY(page,300,475,false,bounds);
  const selected=page.locator('#exhibition-selected-planes [data-wall-state="candidate-selected"]');await selected.waitFor({state:'visible'});assert.equal(await selected.getAttribute('stroke'),'#55c879');const hoverBox=await selected.boundingBox();await page.keyboard.press('Escape');await page.mouse.move(hoverBox.x+hoverBox.width/2,hoverBox.y+hoverBox.height/2);const greenHover=page.locator('[data-wall-state="candidate-hover"]');await greenHover.waitFor({state:'visible'});assert.equal(await greenHover.getAttribute('stroke'),'#55c879');await clickXY(page,300,475,false,bounds);
  await clickXY(page,500,475,false,bounds);await page.locator('#exhibition-enter').click();
  await page.mouse.move(hoverBox.x+hoverBox.width/2,hoverBox.y+hoverBox.height/2);const hovered=page.locator('[data-wall-state="existing-hover"]');await hovered.first().waitFor({state:'visible'});assert.equal(await hovered.first().getAttribute('stroke'),'#68baff');
  await clickXY(page,300,475,false,bounds);
  const blue=page.locator('#exhibition-selected-planes [data-wall-state="existing-selected"]');await blue.first().waitFor({state:'visible'});assert.equal(await blue.count(),2);assert.equal(await blue.first().getAttribute('stroke'),'#168bff');
  assert.equal(await page.locator('#wall-part-add').textContent(),'Dodaj fragment');assert.equal(await page.locator('#wall-part-remove').textContent(),'Odejmij fragment');
  const menu=await page.locator('#exhibition-confirm').boundingBox(),add=await page.locator('#wall-part-add').boundingBox(),remove=await page.locator('#wall-part-remove').boundingBox(),save=await page.locator('#exhibition-enter').boundingBox();
  near(add.y,remove.y);near(add.width,remove.width);assert.ok(save.y>=add.y+add.height+6);near(save.width,remove.x+remove.width-add.x);assert.ok(menu.width<260);
  assert.equal(await page.locator('#exhibition-enter').getAttribute('data-action'),'save');
  await page.locator('#wall-part-remove').click();await clickXY(page,500,475,false,bounds);await page.waitForFunction(()=>document.querySelector('#plan-orbit').dataset.selectedWallPartCount==='1');assert.equal(await page.locator('#plan-orbit').getAttribute('data-selected-wall-part-count'),'1');
  await page.locator('#exhibition-enter').click();let walls=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('exhibition-planner-v2',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('library'),q=tx.objectStore('library').get('plan');tx.oncomplete=()=>{db.close();resolve(q.result.plans.find(p=>p.id===q.result.active).exhibition.surfaces);};};}));assert.equal(Object.keys(walls).length,1);assert.equal(Object.values(walls)[0].sourceIds.length,1);
  await page.locator('#view-mode-layout').click();await page.locator('#exhibition-placeholder').click();const a=await wallPoint(page,30,30),b=await wallPoint(page,80,80);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();const art=await page.locator('[data-placement-id]').getAttribute('data-placement-id');
  await page.locator('#view-mode-walls').click();await clickXY(page,300,475,false,bounds);await page.locator('#wall-part-add').click();await clickXY(page,500,475,false,bounds);await page.locator('#exhibition-enter').click();await page.locator('#view-mode-layout').click();assert.equal(await page.locator('[data-placement-id]').getAttribute('data-placement-id'),art);near(Number(await page.locator('#exhibition-wall').getAttribute('data-width-cm')),400);
  await page.locator('#view-mode-walls').click();await clickXY(page,300,475,false,bounds);await page.locator('#wall-part-remove').click();await clickXY(page,300,475,false,bounds);await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-confirm').isVisible(),'Removing the occupied part must not discard artwork');await clickXY(page,500,475,false,bounds);assert.equal(await page.locator('#exhibition-enter').getAttribute('data-action'),'delete');assert.notEqual(await page.locator('#exhibition-enter').evaluate(e=>getComputedStyle(e).color),await page.locator('#wall-part-add').evaluate(e=>getComputedStyle(e).color));await page.locator('#exhibition-enter').click();assert.ok(await page.locator('#exhibition-confirm').isVisible(),'Removing the occupied part must not discard artwork');await page.keyboard.press('Escape');await page.locator('#view-mode-layout').click();assert.equal(await page.locator('[data-placement-id]').getAttribute('data-placement-id'),art);
  await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});assert.equal(await page.locator('[data-placement-id]').getAttribute('data-placement-id'),art);
 });}finally{await browser.close();}
});


test('Unit: wall dimension chains cover each axis once, deduplicate seams and ignore holes',()=>{
 const surface={widthCm:400,heightCm:250,rings:[[{x:0,y:0},{x:200,y:0},{x:400,y:0},{x:400,y:150},{x:200,y:150},{x:200,y:250},{x:0,y:250}]]};
 const chains=scope.E.wallDimensionChains(surface);assert.deepEqual(Array.from(chains.x,s=>s.value),[200,200]);assert.deepEqual(Array.from(chains.y,s=>s.value),[150,100]);for(const axis of ['x','y'])near(chains[axis].reduce((n,s)=>n+s.value,0),axis==='x'?400:250);
 const rectangle={widthCm:400,heightCm:250,rings:[[{x:0,y:0},{x:200,y:0},{x:400,y:0},{x:400,y:250},{x:0,y:250}],[{x:50,y:50},{x:70,y:50},{x:70,y:70},{x:50,y:70}]]};const simple=scope.E.wallDimensionChains(rectangle);assert.equal(simple.x.length,0);assert.equal(simple.y.length,0);
 const reverse=scope.E.wallDimensionChains({...surface,rings:[surface.rings[0].slice().reverse()]});assert.deepEqual(Array.from(reverse.x,s=>s.value),[200,200]);assert.deepEqual(Array.from(reverse.y,s=>s.value),[150,100]);
});

test('E2E: stepped wall shows inner dimension chains and outer totals without duplicating rectangular sides',async()=>{
 const browser=await launch();try{await session(browser,async({page,draw})=>{
  page.setDefaultTimeout(6000);await draw('rectangle',[[200,350],[400,600]]);await draw('rectangle',[[400,450],[600,600]]);await page.locator('#view-mode-walls').click();const bounds={minX:200,minY:350,maxX:600,maxY:600};await clickXY(page,300,475,false,bounds);await page.locator('#exhibition-enter').click();await page.locator('#view-mode-layout').click();assert.equal(await page.locator('[data-wall-chain]').count(),0);
  await page.locator('#view-mode-walls').click();await clickXY(page,300,475,false,bounds);await page.locator('#wall-part-add').click();await clickXY(page,500,525,false,bounds);await page.locator('#exhibition-enter').click();await page.locator('#view-mode-layout').click();
  async function check(){
   const extensionStyles=await page.locator('.exhibition-dimension-extension').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).strokeDasharray));assert.ok(extensionStyles.length>0,'Dimension extension lines have their own style');assert.ok(extensionStyles.every(value=>value!=='none'&&parseFloat(value)>0),'Extension lines are dashed');assert.ok(extensionStyles.every(value=>{const [dash,gap]=value.split(/[ ,]+/).map(parseFloat);return gap>=dash*3;}),'Extension line gaps are at least three times longer than dashes');
   const dimensionStyles=await page.locator('.exhibition-dimension-line:not(.exhibition-dimension-extension)').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).strokeDasharray));assert.ok(dimensionStyles.length>0);assert.ok(dimensionStyles.every(value=>value==='none'),'Dimension lines and ticks stay solid');
   const values=await page.locator('[data-wall-chain]').evaluateAll(nodes=>nodes.map(e=>({axis:e.dataset.wallChain,value:Number(e.dataset.dimensionValue),offset:Number(e.dataset.dimensionOffset)})));assert.equal(values.length,4);values.filter(v=>v.axis==='x').forEach(v=>near(v.value,200));values.filter(v=>v.axis==='y').map(v=>v.value).sort((a,b)=>a-b).forEach((value,i)=>near(value,[100,150][i]));
   for(const [axis,total]of [['x',400],['y',250]]){near(values.filter(v=>v.axis===axis).reduce((n,v)=>n+v.value,0),total);const overall=page.locator(`[data-wall-dimension="${axis==='x'?'width':'height'}"]`);assert.equal(await overall.count(),1);near(Number(await overall.getAttribute('data-dimension-value')),total);const outer=Number(await overall.getAttribute('data-dimension-offset'));assert.ok(values.filter(v=>v.axis===axis).every(v=>axis==='x'?outer>v.offset:outer<v.offset));}
   const svg=await page.locator('#exhibition-wall').boundingBox();for(const box of await page.locator('[data-wall-chain] text,[data-wall-dimension="width"] text,[data-wall-dimension="height"] text').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON())))assert.ok(box.x>=svg.x-1&&box.y>=svg.y-1&&box.right<=svg.x+svg.width+1&&box.bottom<=svg.y+svg.height+1,'Dimension labels fit the canvas');
  }
  await check();await page.setViewportSize({width:768,height:800});await check();await page.reload();await page.locator('#exhibition-editor').waitFor({state:'visible'});await check();
 });}finally{await browser.close();}
});
