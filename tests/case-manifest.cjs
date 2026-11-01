const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file='cad-02-point-measurements.test.cjs';
function collectNames(source,index=0,count=1){
 const names=[];
 vm.runInNewContext(source,{require(name){if(name==='node:test')return{test:name=>names.push(name),before:()=>{},after:()=>{}};if(name==='./cad-test-helpers.cjs')return{};if(name==='node:assert/strict')return require(name);throw Error('Unexpected registration dependency: '+name);},process:{env:{CAD_SHARD_INDEX:String(index),CAD_SHARD_COUNT:String(count)}}},{filename:file,timeout:2000});
 return names;
}
function validatePartitions(full,shards){
 const all=shards.flat(),sorted=values=>JSON.stringify([...values].sort());
 if(!full.length||new Set(full).size!==full.length||new Set(all).size!==all.length||sorted(full)!==sorted(all))throw Error('Partitions omit or repeat required cases');
 return true;
}
function measurementManifest(){
 const source=fs.readFileSync(path.join(__dirname,file),'utf8'),full=collectNames(source),shards=Array.from({length:4},(_,i)=>collectNames(source,i,4));
 validatePartitions(full,shards);return{full,shards};
}
module.exports={collectNames,validatePartitions,measurementManifest};
