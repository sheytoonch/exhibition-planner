const {test}=require('node:test'),assert=require('node:assert/strict');
const {schedule,orderJobs,updateHistory,validateCases,compareReports}=require('./test-scheduler.cjs');
const {createPolicy,createSampler,configuration}=require('./adaptive-workers.cjs');
const {resourceSummary,formatResources}=require('./test-summary.cjs');

test('Unit: resource report distinguishes whole-machine CPU thread equivalents from worker counts',()=>{
 const stats=resourceSummary([{cpu:.5,logicalProcessors:20,availableLogical:20},{cpu:1,logicalProcessors:20,availableLogical:20}]);
 assert.equal(stats.cpuAverage,.75);assert.equal(stats.cpuPeak,1);assert.equal(stats.threadEquivalentAverage,15);assert.equal(stats.threadEquivalentPeak,20);
 const output=formatResources(stats);assert.match(output,/75,0%/);assert.match(output,/dostępne: 20/);assert.match(output,/średnio 15,0/);assert.match(output,/ekwiwalent wątków, cały komputer/);
});
test('Unit: changing logical CPU availability is reported as a range; missing readings are not invented',()=>{
 const stats=resourceSummary([{cpu:null,availableLogical:16},{cpu:.5,logicalProcessors:20,availableLogical:20}]);
 assert.equal(stats.availableLogicalMin,16);assert.equal(stats.availableLogicalMax,20);assert.match(formatResources(stats),/16–20/);
 assert.match(formatResources(resourceSummary([])),/brak pomiaru/);assert.equal(resourceSummary([]).threadEquivalentAverage,null);
});

test('Unit: adaptive growth requires sustained CPU and RAM headroom and pressure reduces capacity',()=>{
 const decide=createPolicy({maxWorkers:8}),sample={cpu:.3,freeBytes:8*1024**3,totalBytes:16*1024**3};
 assert.equal(decide(sample,4),4);assert.equal(decide(sample,4),4);assert.equal(decide(sample,4),5);
 assert.equal(decide({...sample,cpu:.95},5),5);assert.equal(decide({...sample,cpu:.95},5),4);
 assert.equal(decide({...sample,freeBytes:1024**3},4),4);assert.equal(decide({...sample,freeBytes:1024**3},4),3);
 assert.equal(decide({...sample,cpu:null},3),2);
 for(let i=0;i<12;i++)assert.ok(decide(sample,8)<=8);
 assert.equal(configuration({availableParallelism:()=>2,cpus:()=>[]}).maxWorkers,1);
});

test('Unit: CPU sampler uses idle/total deltas rather than process CPU or Windows loadavg',()=>{
 let tick=0;const system={cpus:()=>[{times:tick++?{user:70,idle:130,sys:0}:{user:20,idle:80,sys:0}}],freemem:()=>123,totalmem:()=>456};
 assert.deepEqual(createSampler(system)(),{cpu:.5,freeBytes:123,totalBytes:456,logicalProcessors:1,availableLogical:1});
});

test('Unit: initial auto scheduling reuses fixed-four estimates without contaminating fixed history',()=>{
 const history={jobs:{short:{4:[1]},long:{4:[20]}}};assert.deepEqual(orderJobs([{id:'short'},{id:'long'}],history,'auto').map(j=>j.id),['long','short']);
 const updated=updateHistory(history,[{id:'long',passed:true,durationMs:3}],'auto');assert.deepEqual(updated.jobs.long[4],[20]);assert.deepEqual(updated.jobs.long.auto,[3]);
});

test('Unit: adaptive slots grow, drain under pressure and execute every queued job once',async()=>{
 let active=0,peak=0,count=0;const limits=[];
 const result=await schedule(Array.from({length:30},(_,i)=>({id:String(i)})),{workers:4,adaptive:{initialWorkers:2,intervalMs:2,sample:()=>({}),decide:(_,limit)=>++count<4?Math.min(4,limit+1):1,onSample:s=>limits.push(s.limit)},execute:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,12));active--;return{passed:true};}});
 assert.equal(peak,4);assert.ok(limits.includes(1));assert.equal(result.results.length,30);assert.equal(new Set(result.results.map(r=>r.id)).size,30);assert.ok(result.results.every(r=>r.passed));assert.equal(active,0);
});

test('Unit: failed resource sampling reduces starts without losing jobs',async()=>{
 const decide=createPolicy({maxWorkers:4});const result=await schedule([{id:'a'},{id:'b'},{id:'c'}],{workers:4,adaptive:{initialWorkers:2,intervalMs:1,sample:()=>{throw Error('no counters');},decide},execute:async()=>{await new Promise(r=>setTimeout(r,5));return{passed:true};}});
 assert.equal(result.results.length,3);assert.ok(result.results.every(r=>r.passed));
});
test('Unit: four worker slots refill immediately and execute every job exactly once',async()=>{
  const jobs=Array.from({length:9},(_,i)=>({id:String(i),test:'fixture'}));let active=0,peak=0;const started=[],finished=[];
  const result=await schedule(jobs,{workers:4,execute:async(job,worker)=>{active++;peak=Math.max(peak,active);started.push([job.id,worker,finished.includes('0')]);await new Promise(resolve=>setTimeout(resolve,job.id==='0'?60:5));finished.push(job.id);active--;return{passed:true};}});
  assert.equal(peak,4);assert.equal(result.results.length,jobs.length);assert.equal(new Set(result.results.map(r=>r.id)).size,jobs.length);assert.ok(started.slice(4).some(row=>!row[2]),'A free worker gets another task before the longest completes');assert.ok(result.workerMs.every(ms=>ms>0));
});
test('Unit: resource locks prevent collisions while independent jobs continue after a failure',async()=>{
  let shared=0,peak=0;const result=await schedule([{id:'a',lock:true},{id:'b',lock:true},{id:'c'}],{workers:4,resources:job=>job.lock?['shared-file']:[],execute:async job=>{if(job.lock){shared++;peak=Math.max(peak,shared);}await new Promise(r=>setTimeout(r,5));if(job.lock)shared--;if(job.id==='a')throw Error('worker failure');return{passed:true};}});
  assert.equal(peak,1);assert.equal(result.results.length,3);assert.equal(result.results.filter(r=>r.passed).length,2);
});
test('Unit: unknown tasks run early, then descending five-sample mean; failed timings are excluded',()=>{
  const jobs=['short','new','long'].map(id=>({id})),history={jobs:{short:{4:[10,20]},long:{4:[90,110]}}};assert.deepEqual(orderJobs(jobs,history,4).map(j=>j.id),['new','long','short']);
  const next=updateHistory({jobs:{long:{4:[1,2,3,4,5]}}},[{id:'long',passed:true,durationMs:6},{id:'bad',passed:false,durationMs:999}],4);assert.deepEqual(next.jobs.long[4],[2,3,4,5,6]);assert.equal(next.jobs.bad,undefined);assert.deepEqual(orderJobs(jobs,next,1).map(j=>j.id),['short','new','long']);
});

test('Unit: changing worker count keeps longest-first estimates, including empty timing buckets',()=>{
  const jobs=['short','long','new'].map(id=>({id}));
  const history={jobs:{short:{4:[10]},long:{3:[],4:[100]}}};
  assert.deepEqual(orderJobs(jobs,history,3).map(j=>j.id),['new','long','short']);
  assert.deepEqual(orderJobs(jobs,history,6).map(j=>j.id),['new','long','short']);
  const exact={jobs:{short:{3:[200],4:[10]},long:{3:[20],4:[100]}}};
  assert.deepEqual(orderJobs(jobs,exact,3).map(j=>j.id),['new','short','long']);
  const nearest={jobs:{short:{2:[100],6:[10]},long:{2:[10],6:[100]}}};
  assert.deepEqual(orderJobs(jobs,nearest,5).map(j=>j.id),['new','long','short']);
  assert.deepEqual(orderJobs(jobs,nearest,1).map(j=>j.id),['new','short','long']);
  assert.deepEqual(history.jobs.long[3],[],'Reading an estimate never copies samples into another bucket');
});
test('Unit: missing, skipped, todo, duplicate and incomplete cases cannot pass',()=>{
  const cases=[{id:'a',kind:'unit',status:'passed'}],counts={tests:1,failed:0,skipped:0,todo:0,cancelled:0};assert.ok(validateCases({cases,counts},false,'unit','fixture',true).valid);
  for(const report of [null,{cases:[],counts},{cases:[...cases,...cases],counts:{...counts,tests:2}},{cases:[{...cases[0],status:'skipped'}],counts:{...counts,skipped:1}},{cases,counts:{...counts,tests:2}},{cases,counts:{...counts,todo:1}}])assert.equal(validateCases(report,false,'unit','fixture',true).valid,false);
  assert.equal(validateCases({cases,counts},false,'unit','fixture',false).valid,false);
  assert.equal(validateCases(null,true,'unit','legacy.cjs',true,0).valid,false);assert.equal(validateCases(null,true,'unit','legacy.cjs',true,3).valid,true);
});
test('Unit: sequential/parallel comparison requires identical version, case identities, types and outcomes',()=>{
  const a={status:'passed',fingerprint:{hash:'x'},results:[{cases:[{id:'a',kind:'unit',status:'passed'},{id:'b',kind:'e2e',status:'passed'}]}]},b=structuredClone(a);b.results[0].cases.reverse();assert.ok(compareReports(a,b));b.results[0].cases.pop();assert.equal(compareReports(a,b),false);b.fingerprint.hash='other';assert.equal(compareReports(a,b),false);
});
