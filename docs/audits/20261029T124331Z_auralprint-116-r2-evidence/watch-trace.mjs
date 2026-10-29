// Run: node --max-old-space-size=256 <this-file> [rounds=3]. Instruments disposable copies only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.resolve(process.env.AP_WATCH_OUTPUT || path.join(root, 'work/r2-watch'));
fs.mkdirSync(out, {recursive:true});
const rounds = Math.min(6, Math.max(1, Number(process.argv[2] || 3)));
const summary = [];
for (let round=0;round<rounds;round++) {
 const trace = path.join(out, `trace-${round}.jsonl`);
 const test = path.join(out, `probe-${round}.mjs`);
 const instrument = String.raw`
function auditInstrument(dir) {
 const file = dir+'/scripts/watch.mjs';
 let source = readFileSync(file,'utf8');
 source = "import { appendFileSync as auditAppend } from 'node:fs';\nconst audit=(event,data={})=>auditAppend("+JSON.stringify(${JSON.stringify(trace)})+",JSON.stringify({at:Date.now(),hr:process.hrtime.bigint().toString(),pid:process.pid,event,...data})+String.fromCharCode(10));\n"+source;
 const replace = (a,b) => { assert.ok(source.includes(a), 'instrument anchor: '+a); source=source.replace(a,b); };
 replace('sources = new Map();', 'audit("build-start",{kind}); sources = new Map();');
 replace('sources.set(args.path, contents);', 'sources.set(args.path, contents); audit("load",{kind,file:args.path,bytes:contents.length,hash:createHash("sha256").update(contents).digest("hex")});');
 replace('session.building.delete(kind);','audit("build-end",{kind,errors:result.errors.length,sources:sources.size}); session.building.delete(kind);');
 replace('dirty = true;', 'audit("queue",{draining,building:[...session.building]}); dirty = true;');
 replace('const signature = fingerprint(inputs);', 'const signature = fingerprint(inputs); audit("candidate",{signature,lastSuccess,inputs:[...inputs].map(([file,bytes])=>({file,bytes:bytes.length,hash:createHash("sha256").update(bytes).digest("hex")}))});');
 replace('if (!inputsMatch(inputs)) return;', 'if (!inputsMatch(inputs)) { audit("mismatch-before"); return; }');
 replace('const stage = await mkdtemp', 'audit("launch-planned",{signature}); const stage = await mkdtemp');
 replace('await assembleSingleFile({ metadata, template, cssBundle, jsBundle, distHtml, branding, hostedDir, signal: abort.signal });', 'audit("assembler-start",{signature,stage}); await assembleSingleFile({ metadata, template, cssBundle, jsBundle, distHtml, branding, hostedDir, signal: abort.signal }); audit("assembler-end",{signature,stage});');
 replace('console.log(\x60[watch] superseded', 'audit("superseded",{signature,building:[...session.building],sameJs:session.results.js===js,sameCss:session.results.css===css,match:inputsMatch(inputs)}); console.log(\x60[watch] superseded');
 replace('catch (error) { if (!stopping) console.error', 'catch (error) { audit("transaction-error",{message:error.message}); if (!stopping) console.error');
 replace('lastSuccess = signature;', 'audit("publish",{signature}); lastSuccess = signature;');
 replace('if (filename == null || name === null || filename.toString() === name) session.queue();', 'audit("native",{directory,name,event:_event,filename:filename?.toString()}); if (filename == null || name === null || filename.toString() === name) session.queue();');
 writeFileSync(file,source);
}
`;
 let source=fs.readFileSync(path.join(root,'tests/watch-integration.test.js'),'utf8')
 .replace('"../scripts/test-support/watch-harness.mjs"', JSON.stringify(path.join(root,'scripts/test-support/watch-harness.mjs')))
 .replaceAll('const dir = projectCopy();','const dir = projectCopy(); auditInstrument(dir);');
 source=source.replace('def trace(event):', 'def trace(event):\n        import json\n        with Path('+JSON.stringify(trace)+").open('a') as audit:\n            audit.write(json.dumps({'at':int(time.time()*1000),'pid':os.getpid(),'event':'python-'+event})+chr(10))");
 const marker=`appendFileSync(${JSON.stringify(trace)},JSON.stringify({at:Date.now(),pid:process.pid,event:'duplicate-begin',count,traceBefore,outputBefore:inventory(dir,version)})+String.fromCharCode(10));`;
 source=source.replace('for (let i = 0; i < 10; i++) writeFileSync(templateFile, content);',marker+'\nfor (let i = 0; i < 10; i++) writeFileSync(templateFile, content);\n'+`appendFileSync(${JSON.stringify(trace)},JSON.stringify({at:Date.now(),pid:process.pid,event:'duplicate-end'})+String.fromCharCode(10));`);
 if(Number(process.env.AP_WATCH_GAP_MS)>0) source="import * as gapFs from 'node:fs';\n"+source.replace('for (let i = 0; i < 10; i++) writeFileSync(templateFile, content);',"const fd=gapFs.openSync(templateFile,'w');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,"+Math.min(200,Number(process.env.AP_WATCH_GAP_MS))+");gapFs.writeSync(fd,content);gapFs.closeSync(fd);");
 source=source.replace('assert.equal(readFileSync(`${dir}/assembler-trace`, "utf8"), traceBefore, "Duplicate saves launched an assembler");', 'appendFileSync('+JSON.stringify(trace)+",JSON.stringify({at:Date.now(),pid:process.pid,event:'duplicate-outputs',count:watch.successes,outputAfter:inventory(dir,version),verified:verify(dir)})+String.fromCharCode(10));\n"+'assert.equal(readFileSync(`${dir}/assembler-trace`, "utf8"), traceBefore, "Duplicate saves launched an assembler");');
 fs.writeFileSync(test,source+'\n'+instrument);
 const log=fs.openSync(path.join(out,`run-${round}.log`),'w');
 const loadWorkers=Array.from({length:Math.min(2,Number(process.env.AP_WATCH_LOAD||0))},()=>spawn(process.execPath,['--max-old-space-size=32','-e','const end=Date.now()+15000;let n=0;while(Date.now()<end)n=Math.sqrt(n+1);'],{stdio:'ignore'}));
 const child=spawn(process.execPath,['--max-old-space-size=256','--test',test],{cwd:root,detached:process.platform!=='win32',stdio:['ignore',log,log],env:{...process.env,AUD011_REPORT:path.join(out,`original-${round}.json`)}});
 const timer=setTimeout(()=>{try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}},170000);
 const result=await new Promise(resolve=>child.on('close',(code,signal)=>resolve({code,signal})));
 clearTimeout(timer);for(const worker of loadWorkers)worker.kill();await Promise.all(loadWorkers.map(worker=>new Promise(resolve=>{if(worker.exitCode!==null||worker.signalCode!==null)resolve();else worker.once('close',resolve);})));fs.closeSync(log);
 const events=fs.existsSync(trace)?fs.readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const begin=events.find(e=>e.event==='duplicate-begin');
 const candidates=events.filter(e=>e.event==='candidate');
 const launched=events.filter(e=>e.event==='assembler-start');
 const prior=new Set();const launches=launched.map(e=>{const seen=prior.has(e.signature);prior.add(e.signature);return {at:e.at,signature:e.signature,seen};});
 summary.push({round,...result,duplicateAt:begin?.at,candidates:candidates.length,launches,afterDuplicate:events.filter(e=>begin && e.at>=begin.at && ['candidate','assembler-start','assembler-end','superseded','publish','mismatch-before','duplicate-begin','duplicate-end','python-start','python-end','transaction-error','duplicate-outputs'].includes(e.event))});
 console.log(JSON.stringify({round,...result,candidates:candidates.length,launches:launches.length,duplicateAt:begin?.at,extra:launched.filter(e=>begin&&e.at>=begin.at&&e.at<begin.at+650).length}));
}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
