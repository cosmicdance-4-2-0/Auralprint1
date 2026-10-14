// Read-only path/version adapter; accepted F/G/H scripts and evidence stay immutable.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'../../../../..'),version=fs.readFileSync(path.join(root,'version'),'utf8').trim();
const modes={f:'115m-i-f-aud001-aud002/f6/diagnostics/independent.cjs',g:'115m-i-g-acceptance/diagnostics/integrated.cjs',g1:'115m-i-g-aud005/diagnostics/native.cjs',g2:'115m-i-g-aud003/diagnostics/native.cjs',g3:'115m-i-g-aud008-aud009/diagnostics/native.cjs',h:'115m-i-h-aud004/diagnostics/acceptance.cjs'};
const mode=process.argv[2];if(!modes[mode])throw Error('select f, g, g1, g2, g3 or h');
const filename=path.join(root,'docs/audits/remediations',modes[mode]);
let source=fs.readFileSync(filename,'utf8');
source=source.replace(/path\.resolve\(__dirname, ?'\.\.\/\.\.\/\.\.\/\.\.\/\.\.(?:\/\.\.)?'\)/,JSON.stringify(root));
source=source.replace(/dist\/auralprint_0\.1\.15m\.i\.[fgh]\.html/g,`dist/auralprint_${version.slice(1)}.html`);
// Existing I.1 adapter waits for normal RAF projection after canonical Stream error.
if(mode==='h')source=source.replace("const status=await p.locator('#audioStatus').textContent();","await p.waitForFunction(()=>/permission|denied/i.test(document.getElementById('audioStatus').textContent));const status=await p.locator('#audioStatus').textContent();");
process.argv=[process.argv[0],filename,...process.argv.slice(3)];
const diagnostic=new Module(filename,module);diagnostic.filename=filename;diagnostic.paths=module.paths;diagnostic._compile(source,filename);
