const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runSuite,selectTests,tests,fingerprint,checkReport}=require('./cad-suite.cjs');
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cad-runner-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('cad-runner-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}

test('Runner: auto mode preserves complete case accounting and records isolated timing history',async t=>{
 const outputDir=temporary(t),historyPath=path.join(outputDir,'timings.json');
 const result=await runSuite({workers:'auto',selected:['parser.cjs','constraints.cjs'],outputDir,historyPath,quiet:true,execute:()=>({status:0,assertions:1})});
 assert.equal(result.summary.status,'passed');assert.equal(result.summary.workers,'auto');assert.equal(result.summary.complete,true);assert.equal(result.summary.counts.total,2);
 assert.ok(result.summary.adaptive.maxWorkers<=8);assert.ok(result.summary.adaptive.actualWorkers>=1);
 assert.ok(result.summary.resources.availableLogicalMin>=1);assert.ok(result.summary.resources.samples.length>=1);
 assert.ok(result.summary.workerCount>=1&&result.summary.workerCount<=2);
 const history=JSON.parse(fs.readFileSync(historyPath,'utf8'));assert.equal(history.jobs['parser.cjs'].auto.length,1);assert.equal(history.jobs['parser.cjs'][4],undefined);
});
test('Runner: writes complete logs, counts success and failure, retains interrupted progress',async t=>{
  const outputDir=temporary(t);let calls=0;
  const {summary,summaryPath}=await runSuite({workers:1,selected:['parser.cjs','constraints.cjs'],outputDir,historyPath:path.join(outputDir,'timings.json'),quiet:true,execute:()=>{
    const progress=JSON.parse(fs.readFileSync(path.join(outputDir,'summary.json'),'utf8'));assert.equal(progress.status,'running');assert.equal(progress.results.length,calls);
    return ++calls===1?{status:0,assertions:1,stdout:'unit success',stderr:'diagnostic'}:{status:1,stdout:'assertion detail',stderr:'failure detail'};
  }});
  assert.equal(summary.status,'failed');assert.equal(summary.full,false);assert.equal(summary.passed,1);assert.equal(summary.failed,1);assert.deepEqual(JSON.parse(fs.readFileSync(summaryPath,'utf8')),summary);
  assert.ok(summary.resources.availableLogicalMin>=1,'Fixed-worker runs also record available logical processors');
  assert.match(fs.readFileSync(summary.results[0].log,'utf8'),/unit success/);assert.match(fs.readFileSync(summary.results[0].stderr,'utf8'),/diagnostic/);assert.match(fs.readFileSync(summary.results[1].stderr,'utf8'),/failure detail/);
});
test('Runner: timeouts and launch errors never count as success; subsequent tests still run',async t=>{
  let calls=0;const {summary}=await runSuite({workers:1,selected:['parser.cjs','constraints.cjs','storage.cjs'],outputDir:temporary(t),historyPath:path.join(temporary(t),'timings.json'),quiet:true,execute:()=>{calls++;if(calls===1)return{status:null,signal:'SIGTERM',error:new Error('ETIMEDOUT')};if(calls===2)throw Error('spawn rejected');return{status:0,assertions:1};}});
  assert.equal(summary.failed,2);assert.equal(summary.passed,1);assert.match(summary.results[0].error,/ETIMEDOUT/);assert.match(summary.results[1].error,/spawn rejected/);
});
test('Runner: default includes every registered suite; selection is exact, deduplicated and validated',()=>{
  assert.deepEqual(selectTests([]),tests);assert.deepEqual(selectTests(['--all']),tests);assert.deepEqual(selectTests(['exhibition','parser.cjs','exhibition.test.cjs']),['exhibition.test.cjs','parser.cjs']);
  assert.throws(()=>selectTests(['exhibiton']),/Unknown test/);assert.throws(()=>selectTests(['../outside.cjs']));assert.throws(()=>selectTests(['--all','parser']));
});
test('Runner: hashes code, ignores logs, rejects stale, failed, incomplete or differently scoped results',async t=>{
  const projectRoot=temporary(t),app=path.join(projectRoot,'app.js');fs.writeFileSync(app,'version 1');
  const result=await runSuite({workers:1,selected:['parser.cjs'],outputDir:path.join(projectRoot,'output'),historyPath:path.join(projectRoot,'timings.json'),projectRoot,quiet:true,execute:()=>({status:0,assertions:1})});
  assert.ok(checkReport(result.summaryPath,['parser.cjs'],projectRoot).valid);assert.ok(!checkReport(result.summaryPath,['storage.cjs'],projectRoot).valid);
  const initial=fingerprint(projectRoot).hash;fs.writeFileSync(path.join(projectRoot,'debug.log'),'noise');assert.equal(fingerprint(projectRoot).hash,initial);fs.writeFileSync(app,'version 2');assert.ok(!checkReport(result.summaryPath,['parser.cjs'],projectRoot).valid);fs.writeFileSync(app,'version 1');
  for(const status of ['running','failed','changed']){fs.writeFileSync(result.summaryPath,JSON.stringify({...result.summary,status}));assert.ok(!checkReport(result.summaryPath,['parser.cjs'],projectRoot).valid);}
  const changed=await runSuite({workers:1,selected:['parser.cjs'],outputDir:path.join(projectRoot,'changed'),historyPath:path.join(projectRoot,'timings.json'),projectRoot,quiet:true,execute:()=>{fs.writeFileSync(app,'edited during test');return{status:0,assertions:1};}});assert.equal(changed.summary.status,'changed');assert.deepEqual(changed.summary.changedFiles,['app.js']);
});


test('Runner: dependency manifests invalidate saved test success',async t=>{
 const root=temporary(t);fs.mkdirSync(path.join(root,'tests'));fs.writeFileSync(path.join(root,'app.js'),'app');
 for(const name of ['package.json','package-lock.json','fixtures/sample.json']){const file=path.join(root,'tests',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'version 1');}
 const result=await runSuite({workers:1,selected:['parser.cjs'],outputDir:path.join(root,'output'),historyPath:path.join(root,'timings.json'),projectRoot:root,quiet:true,execute:()=>({status:0,assertions:1})});
 for(const name of ['package.json','package-lock.json','fixtures/sample.json']){
  const file=path.join(root,'tests',name);fs.writeFileSync(file,'version 2');
  assert.equal(checkReport(result.summaryPath,['parser.cjs'],root).valid,false,name+' must invalidate the saved result');fs.writeFileSync(file,'version 1');
 }
});

test('Runner: documented library scenarios belong to the complete regression',()=>{
 const inventory=require('./test-inventory.json');
 for(const file of ['parser-browser.cjs','authors.cjs','clipboard.cjs','metadata.cjs','photo-editor.cjs']){
  assert.ok(tests.includes(file),file+' is not in --all');assert.equal(inventory[file]?.kind,'e2e');assert.equal(inventory[file]?.legacy,true);
 }
});


test('Runner: reports Node Playwright and browser versions for reproducibility',async t=>{
 const outputDir=temporary(t),result=await runSuite({workers:1,selected:['storage.cjs'],outputDir,historyPath:path.join(outputDir,'timings.json'),quiet:true,execute:(command,args,options)=>{
  fs.writeFileSync(options.env.CAD_BROWSER_REPORT,JSON.stringify({version:'test-browser',playwright:'test-playwright',executablePath:'test-executable'}));return{status:0,assertions:1};
 }});
 assert.equal(result.summary.runtime.node,process.version);assert.equal(result.summary.runtime.playwright,require('@playwright/test/package.json').version);
 assert.deepEqual(result.summary.runtime.browsers,[{version:'test-browser',playwright:'test-playwright',executablePath:'test-executable'}]);
});
