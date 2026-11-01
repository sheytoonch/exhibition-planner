const fs=require('node:fs'),util=require('node:util');
module.exports=async function*(events){
  const cases=[],queued=new Set();let counts=null;
  for await(const {type,data}of events){
    if(type==='test:enqueue')queued.add(`${data.file||''}:${data.line||0}:${data.name}`);
    if((type==='test:pass'||type==='test:fail')&&data.details?.type!=='suite'){
      const kind=/^(Unit:|Runner:)/.test(data.name)?'unit':/^(E2E:|Browser:)/.test(data.name)?'e2e':process.env.CAD_DEFAULT_KIND||'unit';
      const record={id:`${data.file||process.env.CAD_TEST_FILE}:${data.line||0}:${data.name}`,name:data.name,kind,status:data.skip?'skipped':data.todo?'todo':type==='test:pass'?'passed':'failed',durationMs:data.details?.duration_ms||0};cases.push(record);
      yield `${record.status.toUpperCase()} ${record.name}\n`;
      if(type==='test:fail')yield util.inspect(data.details?.error,{depth:5})+'\n';
    }
    if(type==='test:summary')counts=data.counts;
    if(type==='test:stdout'||type==='test:stderr')yield data.message;
  }
  const report={cases,counts,queued:queued.size};
  if(process.env.CAD_CASE_REPORT)fs.writeFileSync(process.env.CAD_CASE_REPORT,JSON.stringify(report,null,2));
};
