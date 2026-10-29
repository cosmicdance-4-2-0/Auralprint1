// Bounded read-only sizing check. Close Chromium after six seconds per case.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),zlib=require('node:zlib');
const {chromium}=require('../../../node_modules/playwright');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const results=[];
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,">');return;}try{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,pathname)));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  for(const test of [{name:'ordinary',digits:1,count:4096,prefix:'ORB'},{name:'opaque-long',digits:20000,count:4096,prefix:'X'},{name:'numeric-small-collection',digits:20000,count:2,prefix:'ORB'},{name:'numeric-large-collection',digits:20000,count:4096,prefix:'ORB'}]){
   const payload={schema:16,prefs:{orbs:[{id:test.prefix+'9'.repeat(test.digits)},...Array.from({length:test.count-1},()=>({}))]}},json=JSON.stringify(payload),hash='#z='+zlib.deflateSync(json).toString('base64url');
   const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});let timer;
   try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.evaluate(()=>import('/src/js/presets/url-preset.js'));const start=performance.now();
    const job=page.evaluate(async hash=>{const {decodePrefsFromHash}=await import('/src/js/presets/url-preset.js');let ticks=0;const timer=setInterval(()=>ticks++,20),start=performance.now();const p=await decodePrefsFromHash(hash);clearInterval(timer);return {durationMs:performance.now()-start,identityCharacters:p.orbs.reduce((n,o)=>n+o.id.length,0),count:p.orbs.length,ticks};},hash).then(value=>({completed:true,...value}));
    const value=await Promise.race([job,new Promise(resolve=>{timer=setTimeout(()=>resolve({completed:false,externalDeadlineMs:6000}),6000)})]);
    results.push({...test,inputJsonBytes:Buffer.byteLength(json),hashChars:hash.length,wallMs:performance.now()-start,...value});
   }finally{clearTimeout(timer);await browser.close();}
  }
 }finally{await new Promise(r=>server.close(r));fs.writeFileSync(path.join(__dirname,'native-identity.json'),JSON.stringify(results,null,2)+'\n');}
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
