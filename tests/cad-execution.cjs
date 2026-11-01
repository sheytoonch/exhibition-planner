const {measurementManifest}=require('./case-manifest.cjs');
const fs=require('node:fs'),path=require('node:path');
const {schedule,orderJobs,updateHistory,executeProcess,validateCases}=require('./test-scheduler.cjs');
const {resourceSummary,formatResources}=require('./test-summary.cjs');
const projectRoot=path.resolve(__dirname,'..');
const readJSON=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
function atomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,JSON.stringify(data,null,2));fs.renameSync(temp,file);}
async function saveTimings(file,results,workers){
  const lock=file+'.lock',deadline=Date.now()+5000;let handle;fs.mkdirSync(path.dirname(file),{recursive:true});
  while(handle===undefined){try{handle=fs.openSync(lock,'wx');fs.writeFileSync(handle,String(process.pid));}catch(error){if(error.code!=='EEXIST')throw error;const owner=Number(fs.readFileSync(lock,'utf8'));if(owner){try{process.kill(owner,0);}catch(error){if(error.code==='ESRCH'){fs.unlinkSync(lock);continue;}}}if(Date.now()>deadline)throw Error('Timing history lock timeout');await new Promise(resolve=>setTimeout(resolve,25));}}
  try{atomic(file,updateHistory(readJSON(file,{version:1,jobs:{}}),results,workers));}finally{fs.closeSync(handle);fs.unlinkSync(lock);}
}
function metadata(test){const entry=readJSON(path.join(__dirname,'test-inventory.json'),{})[test];if(!entry||!['unit','e2e'].includes(entry.kind)||typeof entry.legacy!=='boolean'||!Array.isArray(entry.locks))throw Error(`Missing explicit test classification: ${test}`);return entry;}
function assertNoImageCapture(selected){
  const visited=new Set();function inspect(file){if(visited.has(file))return;visited.add(file);const source=fs.readFileSync(file,'utf8');if(/\.screenshot\s*\(/.test(source))throw Error(`Image capture is forbidden in automated tests: ${file}`);
    for(const match of source.matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)){let next=path.resolve(path.dirname(file),match[1]);if(!path.extname(next))next+='.cjs';if(next.startsWith(__dirname+path.sep)&&fs.existsSync(next))inspect(next);}
  }for(const test of selected)inspect(path.join(__dirname,test));
}
function jobsFor(selected){return selected.flatMap(test=>Array.from({length:test==='cad-02-point-measurements.test.cjs'?4:1},(_,shard)=>({id:test+(test==='cad-02-point-measurements.test.cjs'?`#${shard+1}/4`:''),test,shard,shards:test==='cad-02-point-measurements.test.cjs'?4:1,...metadata(test)})));}
async function runSuite({tests,fingerprint,selected=tests,workers=4,outputDir,execute,quiet=false,projectRoot:root=projectRoot,historyPath=path.join(__dirname,'test-timings.json')}={}){
  const automatic=workers==='auto',adaptiveTools=require('./adaptive-workers.cjs'),config=automatic?adaptiveTools.configuration():null;
  if(!automatic&&(!Number.isInteger(workers)||workers<1||workers>32))throw Error('workers must be auto or an integer from 1 to 32');
  if(!selected.length||new Set(selected).size!==selected.length||selected.some(test=>!tests.includes(test)))throw Error('Invalid, empty or duplicate suite selection');
  assertNoImageCapture(selected);
  const runs=path.join(__dirname,'test-runs'),managed=!outputDir,initial=fingerprint(root);if(!outputDir){fs.mkdirSync(runs,{recursive:true});outputDir=fs.mkdtempSync(path.join(runs,'run-'));}fs.mkdirSync(outputDir,{recursive:true});
  const measurementCases=selected.includes('cad-02-point-measurements.test.cjs')?measurementManifest():null;
  const jobs=jobsFor(selected),history=readJSON(historyPath,{version:1,jobs:{}}),ordered=orderJobs(jobs,history,workers);
  const summary={runtime:{node:process.version,platform:process.platform,arch:process.arch,playwright:require('@playwright/test/package.json').version},status:'running',full:selected.length===tests.length&&tests.every(test=>selected.includes(test)),selected:[...selected],workers,jobs:ordered.map(job=>job.id),fingerprint:initial,total:jobs.length,passed:0,failed:0,startedAt:new Date().toISOString(),results:[],counts:{unit:0,e2e:0,total:0}};
  const summaryPath=path.join(outputDir,'summary.json'),write=()=>atomic(summaryPath,summary);write();
  if(managed){atomic(path.join(runs,'latest.json'),{summaryPath});if(summary.full)atomic(path.join(runs,'latest-full.json'),{summaryPath});}
  const started=performance.now(),resourceSamples=[],sampleResources=adaptiveTools.createSampler();
  const resourceTimer=automatic?null:setInterval(()=>{try{resourceSamples.push(sampleResources());}catch{resourceSamples.push({cpu:null});}},1000);
  if(automatic)summary.adaptive={...config,samples:[]};
  const adaptive=automatic?{initialWorkers:config.initialWorkers,sample:sampleResources,decide:adaptiveTools.createPolicy(config),onSample:sample=>{summary.adaptive.samples.push(sample);resourceSamples.push(sample);}}:undefined;
  let workerMs;try{({workerMs}=await schedule(ordered,{workers:automatic?config.maxWorkers:workers,adaptive,resources:job=>job.locks,onResult:result=>{summary.results.push(result);summary[result.passed?'passed':'failed']++;for(const c of result.cases||[]){summary.counts[c.kind]++;summary.counts.total++;}write();},execute:async(job,worker)=>{
    const directory=path.join(outputDir,job.id.replace(/[^a-zA-Z0-9._-]/g,'_'));fs.mkdirSync(directory,{recursive:true});
    const browserReport=path.join(directory,'browser.json');
    const stdout=path.join(directory,'stdout.log'),stderr=path.join(directory,'stderr.log'),caseReport=path.join(directory,'cases.json'),assertReport=path.join(directory,'assertions.json');
    const args=[...(job.kind==='e2e'?['--require',path.join(__dirname,'offline-tests.cjs')]:[]),...(job.legacy?['--require',path.join(__dirname,'assertion-counter.cjs')]:[]),'--test','--test-isolation=none',`--test-reporter=${require('node:url').pathToFileURL(path.join(__dirname,'cad-reporter.cjs')).href}`,path.join(__dirname,job.test)];
    const options={cwd:projectRoot,env:{...process.env,CAD_BROWSER_REPORT:browserReport,CAD_CASE_REPORT:caseReport,CAD_ASSERT_REPORT:assertReport,CAD_DEFAULT_KIND:job.kind,CAD_TEST_FILE:job.test,CAD_OUTPUT_DIR:directory,CAD_WORKER_INDEX:String(worker),CAD_SHARD_INDEX:String(job.shard),CAD_SHARD_COUNT:String(job.shards)},timeout:job.test==='cad-02-point-measurements.test.cjs'?300000:90000,stdout,stderr,encoding:'utf8',windowsHide:true};
    let processResult;
    if(execute){try{processResult=await execute(process.execPath,args,options);}catch(error){processResult={status:null,error:error.message,stderr:error.stack};}fs.writeFileSync(stdout,processResult.stdout||'');fs.writeFileSync(stderr,processResult.stderr||'');}
    else processResult=await executeProcess(process.execPath,args,options);
    const report=processResult.report||readJSON(caseReport,null),ok=processResult.status===0&&!processResult.error&&!processResult.signal;
    const assertions=processResult.assertions??readJSON(assertReport,{}).assertions;
    const validation=validateCases(report,job.legacy,job.kind,job.test,ok,assertions,job.shards>1?measurementCases.shards[job.shard]:undefined);
    return{passed:validation.valid,cases:validation.cases,assertions:assertions??null,exitCode:processResult.status??null,signal:processResult.signal||null,error:processResult.error?.message||processResult.error||validation.error||null,log:stdout,stderr,caseReport,browser:readJSON(browserReport,null)};
  }}));}finally{clearInterval(resourceTimer);}
  if(!resourceSamples.length)try{resourceSamples.push(sampleResources());}catch{resourceSamples.push({cpu:null});}
  summary.resources={...resourceSummary(resourceSamples),samples:resourceSamples};
  if(automatic){const samples=summary.adaptive.samples,valid=samples.filter(s=>Number.isFinite(s.cpu));summary.adaptive.actualWorkers=workerMs.length;summary.adaptive.cpuAverage=valid.length?valid.reduce((sum,s)=>sum+s.cpu,0)/valid.length:null;summary.adaptive.cpuPeak=valid.length?Math.max(...valid.map(s=>s.cpu)):null;summary.adaptive.minimumFreeBytes=samples.length?Math.min(...samples.filter(s=>Number.isFinite(s.freeBytes)).map(s=>s.freeBytes)):null;}
  summary.runtime.browsers=[...new Map(summary.results.filter(r=>r.browser).map(r=>[JSON.stringify(r.browser),r.browser])).values()];
  const final=fingerprint(root);summary.changedFiles=[...new Set([...Object.keys(initial.files),...Object.keys(final.files)])].filter(file=>initial.files[file]!==final.files[file]);
  const expected=summary.jobs.slice().sort(),actual=summary.results.map(result=>result.id).sort(),caseIds=summary.results.flatMap(result=>result.cases||[]).map(c=>c.id);
  summary.complete=JSON.stringify(expected)===JSON.stringify(actual)&&new Set(caseIds).size===caseIds.length;
  summary.status=summary.failed||!summary.complete?'failed':summary.changedFiles.length?'changed':'passed';summary.workerMs=workerMs;summary.workerCount=workerMs.filter(ms=>ms>0).length;summary.workMs=workerMs.reduce((a,b)=>a+b,0);summary.durationMs=performance.now()-started;summary.finishedAt=new Date().toISOString();write();
  if(!summary.changedFiles.length)try{await saveTimings(historyPath,summary.results,workers);}catch(error){summary.status='failed';summary.harnessError=error.message;write();}
  if(!quiet){process.stdout.write(`Testy: ${summary.counts.total} - jednostkowe: ${summary.counts.unit}, E2E: ${summary.counts.e2e}\nWorkery (${summary.workerCount} użytych): ${workerMs.map(ms=>(ms/1000).toFixed(1)+' s').join(' / ')}\nSuma pracy: ${(summary.workMs/1000).toFixed(1)} s\n`+formatResources(summary.resources));}
  return{summary,summaryPath};
}
module.exports={runSuite,jobsFor,metadata,atomic,assertNoImageCapture};
