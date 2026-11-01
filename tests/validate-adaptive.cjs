// Case-equivalence validation, not a timing benchmark: fixed runs share the machine.
const fs=require('node:fs'),path=require('node:path');
const {runSuite,tests}=require('./cad-suite.cjs');
const {metadata,atomic}=require('./cad-execution.cjs');
const {compareReports}=require('./test-scheduler.cjs');
(async()=>{
 if(tests.some(test=>metadata(test).locks.length))throw Error('Cross-run shared resources require sequential validation');
 const root=path.join(__dirname,'test-runs');fs.mkdirSync(root,{recursive:true});
 const directory=fs.mkdtempSync(path.join(root,'adaptive-validation-'));
 const [one,four]=await Promise.all([runSuite({workers:1,outputDir:path.join(directory,'one')}),runSuite({workers:4,outputDir:path.join(directory,'four')})]);
 if(!compareReports(one.summary,four.summary))throw Error('Fixed one/four validation differs or contains a failure');
 const automatic=await runSuite({workers:'auto'});
 if(!compareReports(four.summary,automatic.summary))throw Error('Adaptive validation differs or contains a failure');
 atomic(path.resolve(__dirname,'../docs/ADAPTIVE-VALIDATION.json'),{sequential:one.summaryPath,fixed:four.summaryPath,automatic:automatic.summaryPath,identical:true,fixedRunsSharedMachine:true});
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
