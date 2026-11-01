async function clickXY(page,x,y,ctrl=false,bounds={minX:200,minY:350,maxX:800,maxY:600}){
  await page.locator('[data-orbit-plane="xy"]').press('Enter');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  const r=await page.locator('#plan-orbit').boundingBox();
  const top=await page.evaluate(()=>Math.max(document.querySelector('.plan-actions').getBoundingClientRect().bottom,document.querySelector('.plan-tabs-bar').getBoundingClientRect().bottom)-document.querySelector('#plan-board').getBoundingClientRect().top+20);
  const available=Math.max(40,r.height-top-30),scale=Math.min(r.width-60,available)/Math.hypot(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
  if(ctrl)await page.keyboard.down('Control');
  try{await page.mouse.click(r.x+r.width/2+(x-(bounds.minX+bounds.maxX)/2)*scale,r.y+top+available/2+(y-(bounds.minY+bounds.maxY)/2)*scale);}finally{if(ctrl)await page.keyboard.up('Control');}
}
module.exports={clickXY};
