const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {session,launch,near}=require('./cad-test-helpers.cjs');
let browser;
before(async()=>{browser=await launch();});after(async()=>{await browser?.close();});
for(const first of ['line','three','bezier'])for(const second of ['line','three','bezier']){
  if(first==='line'&&second==='line')continue;
  test(`Collinear continuation ${first} -> ${second}`,()=>session(browser,async({draw,page,click,read})=>{
    await draw(first,first==='line'?[[200,500],[400,500]]:first==='three'?[[200,500],[300,400],[400,500]]:[[200,500],[400,500],[300,400]]);
    await draw(second,second==='line'?[[600,500],[800,600]]:second==='three'?[[600,500],[700,600],[800,500]]:[[600,500],[800,500],[700,600]]);
    await page.locator('[data-tool-menu=binding-method-menu]').click();
    await page.locator('[data-relation-type=collinear]').click();
    await click(400,500);await click(600,500);
    const geometry=await read();assert.equal(geometry.relations.length,1);
    const relation=geometry.relations[0];assert.equal(relation.type,'collinear');
    const objects=[...geometry.lines,...geometry.shapes],a=objects.find(o=>o.id===relation.objects[0]),b=objects.find(o=>o.id===relation.objects[1]);
    near(a[relation.keyA].x,b[relation.keyB].x);near(a[relation.keyA].y,b[relation.keyB].y);
    assert.equal(a[relation.keyA].nodeId,b[relation.keyB].nodeId);
    const check=async(g,move)=>page.evaluate(({g,move})=>{
      const all=[...g.lines,...g.shapes],a=all.find(o=>o.id===g.relations[0].objects[0]),key=g.relations[0].keyA;
      const changes=move?[{from:a[key],to:{x:a[key].x+25,y:a[key].y+15}}]:[];
      const result=PlanConstraints.solve(g.lines,changes,1,[],{shapes:g.shapes,relations:g.relations});
      if(!result)return null;
      const objects=[...result,...result.shapes],r=g.relations[0],left=objects.find(o=>o.id===r.objects[0]),right=objects.find(o=>o.id===r.objects[1]);
      function tangent(o,k){const e=o[k];if(!o.type){const q=o[k==='a'?'b':'a'];return{x:q.x-e.x,y:q.y-e.y};}if(o.type==='bezier')return{x:o.via.x-e.x,y:o.via.y-e.y};
        const {a,b,via:v}=o,ux=v.x-a.x,uy=v.y-a.y,vx=b.x-a.x,vy=b.y-a.y,d=2*(ux*vy-uy*vx),cx=a.x+(vy*(ux*ux+uy*uy)-uy*(vx*vx+vy*vy))/d,cy=a.y+(ux*(vx*vx+vy*vy)-vx*(ux*ux+uy*uy))/d;
        const x=-(e.y-cy),y=e.x-cx,s=(d>=0?1:-1)*(k==='a'?1:-1);return{x:x*s,y:y*s};}
      const u=tangent(left,r.keyA),v=tangent(right,r.keyB),n=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
      return{cross:(u.x*v.y-u.y*v.x)/n,dot:(u.x*v.x+u.y*v.y)/n,gap:Math.hypot(left[r.keyA].x-right[r.keyB].x,left[r.keyA].y-right[r.keyB].y)};
    },{g,move});
    for(const move of [false,true]){const result=await check(geometry,move);assert.ok(result,'Constraint survives movement');near(result.cross,0);near(result.dot,-1);near(result.gap,0);}
    if([first,second].includes('line')){
      await page.locator('#plan-select').click();
      const curve=geometry.shapes[0],curveSide=relation.objects.indexOf(curve.id),jointKey=curveSide===0?relation.keyA:relation.keyB,remoteKey=jointKey==='a'?'b':'a',remote={...curve[remoteKey]};
      for(let step=0;step<3;step++){
        const before=await read(),line=before.lines[0],x=(line.a.x+line.b.x)/2,y=(line.a.y+line.b.y)/2;
        await click(x,y);
        const box=await page.locator('#plan-surface').boundingBox();
        await page.mouse.move(box.x+box.width*x/1000,box.y+box.height*y/700);
        await page.mouse.down();
        await page.mouse.move(box.x+box.width*(x+15)/1000,box.y+box.height*(y+10)/700,{steps:6});
        await page.mouse.up();
        const after=await read(),updated=after.shapes[0];
        near(updated[remoteKey].x,remote.x);near(updated[remoteKey].y,remote.y);
        near(after.lines[0].a.x,line.a.x+15);near(after.lines[0].a.y,line.a.y+10);
        const result=await check(after,false);assert.ok(result);near(result.gap,0);near(result.cross,0);near(result.dot,-1);
      }
    }
    await page.reload();assert.equal((await read()).relations[0].type,'collinear');
  }));
}
