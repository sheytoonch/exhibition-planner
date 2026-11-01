const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function average(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;}
function timingSamples(history,id,workers){
  const buckets=history.jobs?.[id]||{};
  if(buckets[workers]?.length)return buckets[workers];
  // A new worker count must not forget which jobs are expensive. Reuse
  // estimates for ordering only; recorded measurements stay in their bucket.
  if(buckets[4]?.length)return buckets[4];
  const alternatives=Object.keys(buckets).filter(key=>/^\d+$/.test(key)&&buckets[key].length)
    .sort((a,b)=>Math.abs(Number(a)-(workers==='auto'?4:workers))-Math.abs(Number(b)-(workers==='auto'?4:workers))||Number(a)-Number(b));
  return buckets[alternatives[0]]||buckets.auto||[];
}
function orderJobs(jobs,history,workers){return jobs.map((job,index)=>({job,index,samples:timingSamples(history,job.id,workers)})).sort((a,b)=>Number(!b.samples.length)-Number(!a.samples.length)||average(b.samples)-average(a.samples)||a.index-b.index).map(entry=>entry.job);}
function updateHistory(history,results,workers){const next=structuredClone(history);next.version=1;next.jobs??={};for(const result of results)if(result.passed){const values=((next.jobs[result.id]??={})[workers]||[]);next.jobs[result.id][workers]=[...values,result.durationMs].slice(-5);}return next;}
async function schedule(jobs,{workers=4,execute,resources=()=>[],onResult=()=>{},adaptive}){
  if(!Number.isInteger(workers)||workers<1||workers>32)throw Error('workers must be an integer from 1 to 32');
  const queue=[...jobs],locked=new Set(),results=[],workerMs=Array(workers).fill(0);let running=0,limit=adaptive?adaptive.initialWorkers:workers,used=0,timer;
  if(!Number.isInteger(limit)||limit<1||limit>workers)throw Error('Invalid initial adaptive worker limit');
  await new Promise((resolve,reject)=>{
    function assign(){
      if(!queue.length&&!running){clearInterval(timer);resolve();return;}
      for(let worker=0;worker<limit;worker++){
        if(running>=limit)break;
        if(busy.has(worker))continue;const index=queue.findIndex(job=>resources(job).every(resource=>!locked.has(resource)));if(index<0)continue;
        const job=queue.splice(index,1)[0],locks=resources(job);for(const lock of locks)locked.add(lock);busy.add(worker);running++;used=Math.max(used,worker+1);const start=performance.now();
        Promise.resolve().then(()=>execute(job,worker)).catch(error=>({passed:false,error:error.stack||String(error),cases:[]})).then(result=>{
          const elapsed=performance.now()-start,record={...result,id:job.id,test:job.test,worker:worker+1,durationMs:elapsed};workerMs[worker]+=elapsed;results.push(record);onResult(record);
        }).then(()=>{for(const lock of locks)locked.delete(lock);busy.delete(worker);running--;assign();}).catch(error=>{clearInterval(timer);reject(error);});
      }
    }
    const busy=new Set();
    if(adaptive&&queue.length)timer=setInterval(()=>{
      let sample;try{sample=adaptive.sample();}catch{sample={cpu:null,freeBytes:null,totalBytes:null};}
      const proposed=adaptive.decide(sample,limit);
      if(!Number.isInteger(proposed)||proposed<1||proposed>workers){clearInterval(timer);reject(Error('Invalid adaptive worker decision'));return;}
      // Shrinking only stops new assignments; in-flight tests always finish.
      limit=proposed;adaptive.onSample?.({...sample,limit,running,queued:queue.length});assign();
    },adaptive.intervalMs||1000);
    assign();
  });return{results,workerMs:adaptive?workerMs.slice(0,used):workerMs};
}
function executeProcess(command,args,options){return new Promise(resolve=>{
  const stdout=fs.openSync(options.stdout,'w'),stderr=fs.openSync(options.stderr,'w');let child,problem=null,timer,killTimer;
  const finish=(status,signal)=>{clearTimeout(timer);clearTimeout(killTimer);fs.closeSync(stdout);fs.closeSync(stderr);resolve({status,signal,error:problem});};
  try{child=spawn(command,args,{cwd:options.cwd,env:options.env,windowsHide:true,stdio:['ignore',stdout,stderr]});}
  catch(error){problem=error.message;finish(null,null);return;}
  timer=setTimeout(()=>{problem=`Timeout after ${options.timeout} ms`;if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill();killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);},options.timeout);
  child.once('error',error=>{problem=error.message;});child.once('close',finish);
});}
function validateCases(report,legacy,kind,file,processOK,assertions,expectedNames){
  if(legacy){const wrapped=!report?.cases?.length||report.cases.length===1&&path.basename(report.cases[0].name)===file,valid=processOK&&wrapped&&assertions>0;return{valid,cases:[{id:`legacy:${file}`,name:file,kind,status:valid?'passed':'failed'}],error:valid?null:'Legacy scenario failed, registered unexpected cases or performed no assertions'};}
  const cases=report?.cases||[],counts=report?.counts;
  const valid=Boolean(processOK&&counts&&cases.length>0&&counts.tests===cases.length&&counts.failed===0&&counts.skipped===0&&counts.todo===0&&counts.cancelled===0&&cases.every(test=>test.status==='passed')&&(!expectedNames||JSON.stringify(cases.map(c=>c.name).sort())===JSON.stringify([...expectedNames].sort()))&&new Set(cases.map(test=>test.id)).size===cases.length);
  return{valid,cases,error:valid?null:'Missing, failed, skipped, cancelled, duplicate or incomplete test cases'};
}
function compareReports(a,b){const cases=report=>report.results.flatMap(result=>result.cases||[]).map(test=>`${test.id}|${test.kind}|${test.status}`).sort();return a.status==='passed'&&b.status==='passed'&&a.fingerprint.hash===b.fingerprint.hash&&JSON.stringify(cases(a))===JSON.stringify(cases(b));}
module.exports={average,orderJobs,updateHistory,schedule,executeProcess,validateCases,compareReports};
