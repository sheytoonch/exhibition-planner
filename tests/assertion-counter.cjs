// Legacy scenarios must actually perform assertions, rather than merely exit with 0.
const fs=require('node:fs'),Module=require('node:module'),load=Module._load,wrapped=new WeakMap();let assertions=0;
function wrap(value){if(typeof value!=='function')return value;if(wrapped.has(value))return wrapped.get(value);const proxy=new Proxy(value,{apply(target,thisArg,args){assertions++;return Reflect.apply(target,thisArg,args);},get(target,key,receiver){const member=Reflect.get(target,key,receiver);return ['prototype','constructor','AssertionError','CallTracker'].includes(key)?member:wrap(member);}});wrapped.set(value,proxy);return proxy;}
Module._load=function(request,...args){const value=load.call(this,request,...args);return ['assert','node:assert','assert/strict','node:assert/strict'].includes(request)?wrap(value):value;};
process.on('exit',()=>{if(process.env.CAD_ASSERT_REPORT)fs.writeFileSync(process.env.CAD_ASSERT_REPORT,JSON.stringify({assertions}));});
