const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs'),crypto=require('node:crypto');
function fingerprint(projectRoot=path.resolve(__dirname,'..')){
  const files={};
  function walk(directory){if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.isSymbolicLink()||['test-runs','node_modules','.git'].includes(entry.name))continue;const file=path.join(directory,entry.name);
    if(entry.isDirectory())walk(file);else if(file.startsWith(path.join(projectRoot,'tests','fixtures')+path.sep)||/\.(cjs|mjs|js|html|css)$/.test(entry.name)||['AGENTS.md','test-inventory.json','package.json','package-lock.json'].includes(entry.name))files[path.relative(projectRoot,file).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }}
  for(const name of ['AGENTS.md','app.js','index.html','style.css']){const file=path.join(projectRoot,name);if(fs.existsSync(file))files[name]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
  walk(path.join(projectRoot,'tests'));return{hash:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
const tests=[
  'cad-runner.test.cjs',
  '3d-cache.test.cjs','gpu-mesh.test.cjs','gpu-browser.test.cjs',
  '3d-controls.test.cjs','curved-faces.test.cjs','curved-surfaces-browser.test.cjs',
  'extrude.test.cjs','exhibition.test.cjs',
  'sketch-faces.test.cjs',
  'right-mouse.test.cjs',
  'parser.cjs','constraints.cjs','trim-geometry.cjs','cad-foundation.cjs','cad-editing.cjs',
  'cad-foundation-browser.cjs','cad-editing-browser.cjs','cad-dimensions-browser.cjs',
  'cad-01-drawing.test.cjs','cad-02-between-objects.test.cjs',
  'cad-02-point-measurements.test.cjs',
  'cad-point-behavior.test.cjs',
  'cad-tool-defaults.test.cjs',
  'compact-inspector.test.cjs','curve-continuity.test.cjs','curve-drag-e2e.test.cjs','major-arc-movement.cjs','hv-endpoint.test.cjs',
  'selection-scale.cjs','dimension-drag.cjs','plan-migration.cjs','bezier-tool-groups.cjs',
  'save-image.cjs','storage.cjs','parser-browser.cjs','authors.cjs','clipboard.cjs','metadata.cjs','photo-editor.cjs','layers-construction.test.cjs','vertex-selection.test.cjs','layer-workflow.test.cjs','orbit-3d.test.cjs','orbit-gizmo.test.cjs','orbit-arrows.test.cjs'
];
for(const file of fs.readdirSync(__dirname).filter(name=>name.endsWith('.test.cjs')).sort())if(!tests.includes(file))tests.push(file);
const engine=require('./cad-execution.cjs');
function runSuite(options={}){return engine.runSuite({...options,tests,fingerprint});}
function selectTests(args){
  if(!args.length||args.length===1&&args[0]==='--all')return [...tests];
  if(args.some(arg=>arg.startsWith('--')||/[\\/]/.test(arg)))throw Error('Use --all, --list, or exact test names (for example exhibition).');
  return [...new Set(args.map(name=>{const match=tests.find(test=>test===name||test.replace(/(?:\.test)?\.cjs$/,'')===name);if(!match)throw Error(`Unknown test: ${name}`);return match;}))];
}
function checkReport(summaryPath,selected=tests,projectRoot=path.resolve(__dirname,'..'),workers){
  try{const summary=JSON.parse(fs.readFileSync(summaryPath,'utf8'));const valid=summary.status==='passed'&&summary.complete===true&&(workers===undefined||summary.workers===workers)&&summary.fingerprint?.hash===fingerprint(projectRoot).hash&&summary.selected?.length===selected.length&&selected.every(test=>summary.selected.includes(test));return{valid,summaryPath};}catch{return{valid:false,summaryPath};}
}
module.exports={tests,runSuite,selectTests,fingerprint,checkReport};
if(require.main===module)(async()=>{
  try{const args=process.argv.slice(2);let workers=4;const parseWorkers=value=>value==='auto'?'auto':Number(value);for(let i=0;i<args.length;i++)if(args[i]==='--workers'){workers=parseWorkers(args[i+1]);args.splice(i,2);i--;}else if(args[i].startsWith('--workers=')){workers=parseWorkers(args[i].split('=')[1]);args.splice(i,1);i--;}
  if(args[0]==='--compare'){if(args.length!==3)throw Error('Use --compare report-one.json report-four.json');const {compareReports}=require('./test-scheduler.cjs');const same=compareReports(JSON.parse(fs.readFileSync(args[1],'utf8')),JSON.parse(fs.readFileSync(args[2],'utf8')));process.stdout.write(same?'Identical cases and results.\n':'Reports differ.\n');process.exitCode=same?0:1;return;}
if(args.length===1&&args[0]==='--list')process.stdout.write(tests.join('\n')+'\n');else if(args[0]==='--check'){
    const selected=selectTests(args.slice(1)),full=selected.length===tests.length,pointer=path.join(__dirname,'test-runs',full?'latest-full.json':'latest.json');
    const summaryPath=fs.existsSync(pointer)?JSON.parse(fs.readFileSync(pointer,'utf8')).summaryPath:'',result=checkReport(summaryPath,selected,undefined,workers);process.stdout.write(`${result.valid?'VERIFIED saved result (no tests run)':'NO MATCHING PASS'}; ${summaryPath}\n`);process.exitCode=result.valid?0:1;
  }else{const {summary}=await runSuite({selected:selectTests(args),workers});process.exitCode=summary.status==='passed'?0:1;}}
  catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}
})();
