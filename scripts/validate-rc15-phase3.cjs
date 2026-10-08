// Optional native production-frame diagnostic; external tooling stays optional.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const version=fs.readFileSync(path.join(root,'version'),'utf8').trim();
 const html=fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replace('__AURALPRINT_VERSION__',version)
  .replace(/<link[^>]+>/g,'').replace('<!-- AURALPRINT_INLINE_CSS -->','<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const results=[],errors=[];
  const scenarios=process.env.AP_COUNTS?process.env.AP_COUNTS.split(',').map(count=>({count:Number(count)})):
   [2,64,256,1024,4096].map(count=>({count})).concat([{count:64,maximum:true,warmFrames:40},{count:4096,maximum:true,warmFrames:40}]);
  for(const scenario of scenarios){
   const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/`);
   const result=await page.evaluate(async args=>{const {measureRc15Frame}=await import('/scripts/measure-rc15-frame.mjs');return measureRc15Frame(args);},scenario);
   results.push(result);console.log(JSON.stringify({count:result.count,maximum:result.maximum,initialUiRefreshMs:result.initialUiRefreshMs,domNodes:result.domNodes,frames:result.frames.map(f=>f.totalFrameMs)}));
   if(process.env.AP_REPORT)fs.writeFileSync(process.env.AP_REPORT,JSON.stringify({version,browser:await browser.version(),results,errors},null,2)+'\n');
   await page.close();
  }
  if(errors.length)throw Error(errors.join('\n'));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
