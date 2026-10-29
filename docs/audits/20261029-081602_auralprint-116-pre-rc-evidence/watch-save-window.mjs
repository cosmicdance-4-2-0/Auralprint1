import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, openSync, closeSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = process.cwd();
const copy = mkdtempSync(path.join(tmpdir(), 'auralprint-save-window-'));
for (const name of ['src','scripts','version','package.json']) cpSync(path.join(root,name),path.join(copy,name),{recursive:true});
symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');
const child=spawn(process.execPath,['scripts/watch.mjs'],{cwd:copy,stdio:['pipe','pipe','pipe','ipc']});
let log=''; for (const stream of [child.stdout,child.stderr])stream.on('data',x=>log+=x);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){const end=Date.now()+10000;while(!f()){if(Date.now()>end)throw new Error(label+'\n'+log);await delay(10);}}
const successes=()=> (log.match(/\[watch\] assembled /g)||[]).length;
const launches=()=> (log.match(/\[watch\] assembling /g)||[]).length;
let result;
try {
 await until(()=>successes()===1,'initial build'); await delay(200);
 const template=path.join(copy,'src/index.template.html');const content=readFileSync(template);
 const artifact=path.join(copy,'dist/auralprint_0.1.16-candidate.html');const before=readFileSync(artifact);
 const initial={successes:successes(),launches:launches()};
 for(let i=0;i<10;i++)writeFileSync(template,content);
 await delay(700);
 const atomicDuplicate={successes:successes()-initial.successes,launches:launches()-initial.launches};
 assert.deepEqual(atomicDuplicate,{successes:0,launches:0});
 const base=launches();
 // Model a process being descheduled after open(O_TRUNC) but before write.
 // The final template bytes never change; the open file is observably empty.
 const fd=openSync(template,'w'); await delay(250);writeSync(fd,content);closeSync(fd);
 await delay(700);
 const exposedTruncation={extraLaunches:launches()-base,successes:successes()-initial.successes,preservedOutput:before.equals(readFileSync(artifact)),finalBytesEqual:content.equals(readFileSync(template)),packagingRejectedEmpty:log.includes('Missing or duplicate CSS marker')};
 assert.equal(exposedTruncation.extraLaunches,1);assert.equal(exposedTruncation.successes,0);assert.equal(exposedTruncation.preservedOutput,true);assert.equal(exposedTruncation.finalBytesEqual,true);
 result={node:process.version,platform:process.platform,atomicDuplicate,exposedTruncation,qualification:'Controlled save syscall window; not proof this caused the historic Ubuntu failure.',log};
} finally {child.kill('SIGTERM');await new Promise(r=>child.once('close',r));rmSync(copy,{recursive:true,force:true});}
console.log(JSON.stringify(result,null,2));
