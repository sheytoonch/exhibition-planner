// Read-only UI audit: temporary browser profile, offline, no screenshots.
const fs = require('node:fs');
const {launch, session} = require('../../tests/cad-test-helpers.cjs');
(async () => {
  const browser = await launch(), results = [];
  try {
    await session(browser, async ({page, draw}) => {
      await draw('rectangle', [[300,300],[600,500]]);
      for (const mode of ['2D','3D']) {
        if (mode === '3D') await page.locator('#plan-orbit-toggle').click();
        for (const [width,height] of [[1440,900],[1280,800],[1024,768],[768,900]]) {
          await page.setViewportSize({width,height});
          await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          results.push(await page.evaluate(({mode}) => {
            const rect = e => {const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
            const visible = e => {const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
            const bar = document.querySelector('.plan-actions');
            const controls = [...bar.querySelectorAll('button,input,select')].filter(visible);
            return {mode,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,toolbar:rect(bar),tabs:rect(document.querySelector('.plan-tabs-bar')),visibleToolbarControls:controls.length,undersizedControls:controls.filter(e=>{const r=rect(e);return r.width<24||r.height<24;}).map(e=>({id:e.id,label:e.getAttribute('aria-label')||e.title,...rect(e)}))};
          },{mode}));
        }
      }
    });
    fs.writeFileSync(require('node:path').join(__dirname,'measurements.json'),JSON.stringify(results,null,2)+'\n');
    console.log(JSON.stringify(results.map(({mode,width,height,toolbar,tabs,visibleToolbarControls,undersizedControls})=>({mode,width,height,toolbarHeight:toolbar.height,workspaceStarts:tabs.bottom,controls:visibleToolbarControls,smallTargets:undersizedControls.length}))));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
