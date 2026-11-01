const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');

test('Unit: repository contains one application and independent test dependencies',()=>{
  assert.ok(fs.readdirSync(root).every(name=>! /^(?:tests-)?v\d+$/.test(name)));
  for(const file of ['index.html','app.js','style.css'])assert.ok(fs.existsSync(path.join(root,file)));
  assert.equal(path.basename(__dirname),'tests');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/<title>Wystawa<\/title>/);
  assert.match(html,/<h1>Wystawa<\/h1>/);
  assert.equal(fs.existsSync(path.join(root,'.openai','hosting.json')),false);
  const pkg=require('./package.json'),lock=require('./package-lock.json');
  assert.deepEqual(Object.keys(pkg.devDependencies),['@playwright/test']);
  assert.equal(lock.packages['node_modules/@playwright/test'].version,pkg.devDependencies['@playwright/test']);
  assert.ok(require.resolve('@playwright/test').startsWith(path.join(__dirname,'node_modules')+path.sep));
  for(const file of fs.readdirSync(__dirname).filter(name=>name.endsWith('.cjs'))){
    const text=fs.readFileSync(path.join(__dirname,file),'utf8');
    assert.ok(!/\.\.\/v\d+\//.test(text),`${file} depends on a versioned application directory`);
  }
});
