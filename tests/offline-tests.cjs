// Browser contexts are offline before navigation; bitmap capture is prohibited.
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
function recordBrowser(browser,options={}){
 if(process.env.CAD_BROWSER_REPORT)fs.writeFileSync(process.env.CAD_BROWSER_REPORT,JSON.stringify({version:browser?.version?.()||null,executablePath:options.executablePath||null,playwright:require('@playwright/test/package.json').version}));
}
// Opt in for exactly one loopback origin; the rest of the network remains blocked.
async function allowLoopback(context,origin){
 const url=new URL(origin);
 if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||!url.port||url.username||url.password||url.origin!==origin)throw Error('Only an exact HTTP loopback origin with an explicit port is allowed');
 await context.route('**/*',route=>{let permitted=false;try{permitted=new URL(route.request().url()).origin===origin;}catch{}return permitted?route.continue():route.abort('blockedbyclient');});
 await context.setOffline(false);
}
module.exports={allowLoopback};
async function preparePage(page){await page.context().setOffline(true);page.screenshot=async()=>{throw Error('Bitmap capture is forbidden in automated tests');};const locator=Object.getPrototypeOf(page.locator('body'));locator.screenshot=async()=>{throw Error('Bitmap capture is forbidden in automated tests');};return page;}
async function prepareContext(context){await context.setOffline(true);const create=context.newPage.bind(context);context.newPage=async(...args)=>preparePage(await create(...args));return context;}
const launch=chromium.launch.bind(chromium);chromium.launch=async(...args)=>{const browser=await launch(...args),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);recordBrowser(browser,args[0]);browser.newContext=async(...options)=>prepareContext(await newContext(...options));browser.newPage=async(...options)=>preparePage(await newPage(...options));return browser;};
const persistent=chromium.launchPersistentContext.bind(chromium);chromium.launchPersistentContext=async(...args)=>{const context=await persistent(...args);recordBrowser(context.browser(),args[1]);return prepareContext(context);};
