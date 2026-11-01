function resourceSummary(samples){
 const valid=samples.filter(s=>Number.isFinite(s.cpu)),available=samples.map(s=>s.availableLogical).filter(Number.isFinite);
 const equivalent=valid.filter(s=>Number.isFinite(s.logicalProcessors)).map(s=>s.cpu*s.logicalProcessors);
 const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 return{cpuAverage:mean(valid.map(s=>s.cpu)),cpuPeak:valid.length?Math.max(...valid.map(s=>s.cpu)):null,availableLogicalMin:available.length?Math.min(...available):null,availableLogicalMax:available.length?Math.max(...available):null,threadEquivalentAverage:mean(equivalent),threadEquivalentPeak:equivalent.length?Math.max(...equivalent):null};
}
function formatResources(resources){
 const number=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits).replace('.',','):'brak pomiaru';
 const range=resources.availableLogicalMin===resources.availableLogicalMax?number(resources.availableLogicalMin,0):`${number(resources.availableLogicalMin,0)}–${number(resources.availableLogicalMax,0)}`;
 return `CPU całego komputera: średnio ${Number.isFinite(resources.cpuAverage)?number(resources.cpuAverage*100)+'%':'brak pomiaru'}, szczyt ${Number.isFinite(resources.cpuPeak)?number(resources.cpuPeak*100)+'%':'brak pomiaru'}\nWątki logiczne dostępne: ${range}; obciążenie: średnio ${number(resources.threadEquivalentAverage)}, szczyt ${number(resources.threadEquivalentPeak)} (ekwiwalent wątków, cały komputer)\n`;
}
module.exports={resourceSummary,formatResources};
