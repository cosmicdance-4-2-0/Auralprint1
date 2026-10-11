// Session-only experimental inspector. Does not edit preferences/presets.
import { createSignalLab } from '../audio/signal-lab.js';
export function createSignalLabPanel({ engine = createSignalLab(), documentRef = document, sampleIntervalMs = 100 } = {}) {
  let root, channel, floor, ceiling, status, plot, ctx, lastDraw = -Infinity;
  const history = Array.from({length: 3},()=>new Float32Array(120));
  const labels=['envelope01','attack01','flux01'];
  function reset() { engine.reset(); for (const line of history) line.fill(0);lastDraw=-Infinity; }
  function init() {
    root=documentRef.getElementById('signalLab');
    if(!root) return false;
    channel=root.querySelector('#labChannel'); floor=root.querySelector('#labFloor'); ceiling=root.querySelector('#labCeiling');
    status=root.querySelector('#labReadout');plot=root.querySelector('#labPlot');ctx=plot?.getContext('2d');
    if(!channel||!floor||!ceiling||!status||!ctx) return false;
    const apply=()=>{
      const next={channel:channel.value,lowHz:Number(floor.value),highHz:Number(ceiling.value)};
      if(!engine.select(next)){ status.textContent='Invalid channel or frequency range.';return; }
      reset();status.textContent='Waiting for audio…';
    };
    channel.addEventListener('change',apply);floor.addEventListener('change',apply);ceiling.addEventListener('change',apply);
    apply();return true;
  }
  function draw(data){
    const width=plot.width,height=plot.height;
    ctx.clearRect(0,0,width,height);
    const colors=['#37c4d9','#ffb84d','#ac8aff'];
    for(let i=0;i<labels.length;i++){
      const line=history[i];line.copyWithin(0,1);line[line.length-1]=data.ready?data[labels[i]]:0;
      ctx.strokeStyle=colors[i];ctx.lineWidth=1.8;ctx.beginPath();
      for(let j=0;j<line.length;j++) { const x=j*(width-1)/(line.length-1),y=(height-2)*(1-line[j])+1;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); }
      ctx.stroke();
    }
  }
  function update(frame, dt, nowMs){
    if(!root||!root.open) {reset();return null;}
    const features=engine.update(frame,dt);
    if(!Number.isFinite(nowMs)||nowMs-lastDraw<sampleIntervalMs)return features;
    lastDraw=nowMs;
    status.textContent=features.ready?`Bands: ${features.bandCount} · Envelope: ${features.envelope01.toFixed(3)} · Attack: ${features.attack01.toFixed(3)} · Flux: ${features.flux01.toFixed(3)}`:'Waiting for valid audio analysis…';
    draw(features);return features;
  }
  return {init,update,reset,getFrame:engine.getFrame};
}
