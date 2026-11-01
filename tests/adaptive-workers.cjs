const os=require('node:os');
function cpuCounters(cpus){return cpus.map(cpu=>({idle:cpu.times.idle,total:Object.values(cpu.times).reduce((a,b)=>a+b,0)}));}
function createSampler(system=os){
 let previous=cpuCounters(system.cpus());
 return()=>{const current=cpuCounters(system.cpus());let idle=0,total=0;
  for(let i=0;i<current.length;i++){if(!previous[i])continue;idle+=current[i].idle-previous[i].idle;total+=current[i].total-previous[i].total;}previous=current;
  return{cpu:total>0?Math.max(0,Math.min(1,1-idle/total)):null,freeBytes:system.freemem(),totalBytes:system.totalmem(),logicalProcessors:current.length,availableLogical:system.availableParallelism?.()||current.length||1};
 };
}
function createPolicy({maxWorkers=8}={}){
 let spare=0,pressure=0;
 return(sample,current)=>{
  const reserve=Math.max(2*1024**3,sample.totalBytes*.15);
  if(!Number.isFinite(sample.cpu)||!Number.isFinite(sample.freeBytes)||!Number.isFinite(sample.totalBytes)||sample.totalBytes<=0){spare=pressure=0;return Math.max(1,current-1);}
  if(sample.cpu>.9||sample.freeBytes<reserve){pressure++;spare=0;if(pressure>=2){pressure=0;return Math.max(1,current-1);}}
  else if(sample.cpu<.75&&sample.freeBytes>reserve+512*1024**2){spare++;pressure=0;if(spare>=3){spare=0;return Math.min(maxWorkers,current+1);}}
  else spare=pressure=0;
  return current;
 };
}
function configuration(system=os){const available=system.availableParallelism?.()||system.cpus().length||1,maxWorkers=Math.max(1,Math.min(8,available-2||1));return{available,maxWorkers,initialWorkers:Math.min(4,maxWorkers)};}
module.exports={createSampler,createPolicy,configuration};
