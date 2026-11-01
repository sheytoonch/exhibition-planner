const {installRenderValues}=require('./render-values.cjs');
require('./offline-tests.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('@playwright/test');

async function session(browser, run) {
  const context = await browser.newContext({viewport: {width: 1500, height: 1200}});
  const page = await context.newPage(), errors = [];
  await installRenderValues(page);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => !document.querySelector('#plan-view-button').disabled);
    await page.locator('#plan-view-button').click();
    await page.locator('#plan-empty').click();
    const read = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('exhibition-planner-v2', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('library');
        const query = tx.objectStore('library').get('plan');
        tx.oncomplete = () => { db.close(); resolve(query.result.plans.find(p => p.id === query.result.active).outline); };
        tx.onerror = () => reject(tx.error);
      };
    }));
    const click = async (x, y, modifiers = []) => {
      const r = await page.locator('#plan-surface').boundingBox();
      for(const modifier of modifiers)await page.keyboard.down(modifier);
      try{await page.mouse.click(r.x + r.width*x/1000, r.y + r.height*y/700);}
      finally{for(const modifier of [...modifiers].reverse())await page.keyboard.up(modifier);}
    };
    const draw = async (tool, points, shift = false) => {
      await page.keyboard.press('Escape');
      if (tool === 'line' || tool === 'polyline') {
        await page.locator('[data-tool-menu=line-method-menu]').click();
        await page.locator(tool === 'line' ? '[data-line-method=line]' : '[data-plan-shape=polyline]').click();
      } else if (['three','ends','center','bezier'].includes(tool)) {
        await page.locator('[data-tool-menu=arc-method-menu]').click();
        await page.locator(`[data-arc-method=${tool}]`).click();
      } else await page.locator(`[data-plan-shape=${tool}]`).click();
      for (const [index, point] of points.entries()) {
        if (shift && index) await page.keyboard.down('Shift');
        await click(...point);
        if (shift && index) await page.keyboard.up('Shift');
      }
      if (tool === 'polyline') await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      return read();
    };
    const mode = async name => {
      await page.locator('[data-tool-menu=dimension-method-menu]').click();
      assert.equal(await page.locator(`[data-dimension-method=${name}]`).count(),1,`Missing dimension tool: ${name}`);
      await page.locator(`[data-dimension-method=${name}]`).click();
    };
    await run({page, read, click, draw, mode});
    assert.deepEqual(errors, [], 'No browser exceptions');
  } finally { await context.close(); }
}
const launch = () => chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const near = (a,b) => assert.ok(Math.abs(a-b)<.02, `${a} != ${b}`);
async function toggleView(page){
  const in3D=await page.locator('#plan-orbit-toggle').getAttribute('aria-pressed')==='true';
  await page.locator(in3D?'#view-mode-2d':'#plan-orbit-toggle').click();
}
async function renameWall(page,name){await page.locator('#wall-tabs [aria-selected="true"]').dblclick();const input=page.getByRole('textbox',{name:'Nazwa układu'});await input.fill(name);await input.press('Enter');}
module.exports = {session, launch, near, toggleView, renameWall};
