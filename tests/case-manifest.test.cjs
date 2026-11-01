const {test}=require('node:test'),assert=require('node:assert/strict');
const {measurementManifest,validatePartitions}=require('./case-manifest.cjs');
const {validateCases}=require('./test-scheduler.cjs');
test('Unit: all 117 point measurements occur once in the union of four partitions',()=>{
 const {full,shards}=measurementManifest();assert.equal(full.length,117);assert.deepEqual(shards.map(s=>s.length),[30,29,29,29]);assert.ok(validatePartitions(full,shards));
 const missing=shards.map(s=>s.slice());missing[0].pop();assert.throws(()=>validatePartitions(full,missing),/omit or repeat/);
 const duplicate=shards.map(s=>s.slice());duplicate[0].push(duplicate[1][0]);assert.throws(()=>validatePartitions(full,duplicate),/omit or repeat/);
});
test('Unit: successful self-reported counts cannot hide missing or extra manifest cases',()=>{
 const report={cases:[{id:'a',name:'first',status:'passed'}],counts:{tests:1,failed:0,skipped:0,todo:0,cancelled:0}};
 assert.equal(validateCases(report,false,'e2e','fixture',true,undefined,['first','second']).valid,false);
 assert.equal(validateCases(report,false,'e2e','fixture',true,undefined,['other']).valid,false);
 assert.equal(validateCases(report,false,'e2e','fixture',true,undefined,['first']).valid,true);
});
