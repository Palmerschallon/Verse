// engine.js — clean starter, deterministic & alive

// RNG
function xmur3(str){ let h=1779033703^str.length; for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19;} 
  return function(){ h=Math.imul(h^(h>>>16),2246822507); h=Math.imul(h^(h>>>13),3266489909); return (h^=h>>>16)>>>0; }; }
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }

// Canvas bootstrap
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha:false });
function fit(){ const dpr=Math.max(1,Math.min(3,devicePixelRatio||1));
  canvas.width=Math.floor(innerWidth*dpr); canvas.height=Math.floor(innerHeight*dpr);
  canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px'; ctx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener('resize', fit, {passive:true}); fit();

// State
const state = {
  seed: '400 ring calm',                       // default
  rng: mulberry32(1),
  t: 0,
  parts: [],
  params: { count: 400, shape:'none', trails: 0.94, tremor: 0.25, tide: 0.15 }
};
function rnd(){ return state.rng(); }

// Minimal parser: numbers set count, keywords set a shape
const SHAPES = ['ring','spiral','grid','lattice','wave','line'];
function parseSeed(text){
  const s=(text||'').toLowerCase();
  let count = (s.match(/\b\d{1,5}\b/)||[])[0]; count = count? Math.max(0,Math.min(8000, +count)) : 400;
  let shape = SHAPES.find(k => s.includes(k)) || 'none';
  let one   = /\b(one|solo|single)\b/.test(s);
  if(one) count = 1;
  return { count, shape, trails: state.params.trails, tremor: state.params.tremor, tide: state.params.tide };
}

// Shapes → sample points
function center(){ return {cx: innerWidth/2, cy: innerHeight/2}; }
function samplePath(fn, n){ const pts=[]; for(let i=0;i<n;i++){ const t=i/n; pts.push(fn(t)); } return pts; }
function shapeSamples(name){
  const {cx,cy}=center(), R=Math.min(innerWidth,innerHeight)*0.32, N=360;
  switch(name){
    case 'ring':   return samplePath(t=>({x:cx+R*Math.cos(2*Math.PI*t), y:cy+R*Math.sin(2*Math.PI*t)}), N);
    case 'spiral': return samplePath(t=>{ const a=2*Math.PI*2.2*t, r=R*0.1+R*0.9*t; return {x:cx+r*Math.cos(a), y:cy+r*Math.sin(a)}; }, N);
    case 'wave':   return samplePath(t=>{ const A=R*0.33; const x=(innerWidth*0.12)+t*(innerWidth*0.76); return {x, y:cy+A*Math.sin(2*Math.PI*2*t)}; }, N);
    case 'line':   return samplePath(t=>({x:(innerWidth*0.12)+t*(innerWidth*0.76), y:cy}), N);
    case 'grid': { const step=Math.max(18,R*0.18), pts=[]; for(let y=cy-R;y<=cy+R;y+=step) for(let x=cx-R;x<=cx+R;x+=step) pts.push({x,y}); return pts; }
    case 'lattice':{ const step=Math.max(22,R*0.18), pts=[]; for(let yi=0,y=cy-R;y<=cy+R;yi++,y+=step){ for(let xi=0,x=cx-R;x<=cx+R;xi++,x+=step){ const off=(yi%2? step/2:0); pts.push({x:x+off,y}); } } return pts; }
    default: return [];
  }
}
let _samples=[], _samplesName='none';

function setSeed(text){
  state.seed = text;
  const h = xmur3(state.seed); state.rng = mulberry32(h());
  state.params = parseSeed(text);
  // respawn particles
  state.parts.length = 0;
  for(let i=0;i<state.params.count;i++){
    state.parts.push({ x:rnd()*innerWidth, y:rnd()*innerHeight,
      vx:(rnd()*2-1)*0.2, vy:(rnd()*2-1)*0.2, id:i });
  }
  _samples=[]; _samplesName='none';
}
setSeed(state.seed);

// Field + step
function attractToShape(p){
  if(!_samples || state.params.shape!==_samplesName){
    _samplesName = state.params.shape;
    _samples = shapeSamples(_samplesName);
  }
  if(!_samples.length) return {fx:0, fy:0};
  let bestDx=0,bestDy=0,best=Infinity;
  for(let i=0;i<_samples.length;i+=3){
    const s=_samples[i], dx=s.x-p.x, dy=s.y-p.y, d2=dx*dx+dy*dy;
    if(d2<best){best=d2; bestDx=dx; bestDy=dy;}
  }
  const pull = 0.0012;
  return {fx:bestDx*pull, fy:bestDy*pull};
}

function step(){
  state.t += 16;
  // trails
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=`rgba(0,0,0,${1-state.params.trails})`;
  ctx.fillRect(0,0,innerWidth,innerHeight);

  if(state.parts.length){
    ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=1;
    ctx.beginPath();
    for(const p of state.parts){
      const t = state.t*(0.0006 + state.params.tide*0.0012);
      const ax=Math.cos(t+p.id*0.01)*0.3, ay=Math.sin(t*1.1+p.id*0.013)*0.3;
      const js=state.params.tremor; const jx=(rnd()*2-1)*js, jy=(rnd()*2-1)*js;
      const sh = attractToShape(p);
      const fx = ax + jx + sh.fx, fy = ay + jy + sh.fy;

      p.vx = p.vx*0.96 + fx*0.6;
      p.vy = p.vy*0.96 + fy*0.6;

      const nx=p.x+p.vx, ny=p.y+p.vy;
      ctx.moveTo(p.x,p.y); ctx.lineTo(nx,ny);
      p.x=nx; p.y=ny;
      if(p.x<0) p.x+=innerWidth; if(p.x>innerWidth) p.x-=innerWidth;
      if(p.y<0) p.y+=innerHeight; if(p.y>innerHeight) p.y-=innerHeight;
    }
    ctx.stroke();
  }
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// UI: paste sheet
const sheet=document.getElementById('sheet'), box=document.getElementById('seedBox'), hint=document.getElementById('hint');
function openSheet(){ sheet.classList.add('open'); box.focus(); setTimeout(()=>box.select(),0); }
function closeSheet(){ sheet.classList.remove('open'); }

addEventListener('click', (e)=>{ if(!sheet.contains(e.target)) openSheet(); });
addEventListener('keydown', (e)=>{ if(e.key==='/'){ e.preventDefault(); openSheet(); } });

document.getElementById('apply').onclick = ()=>{
  const text=(box.value||'').trim(); if(!text) return; setSeed(text); hint.style.display='none'; closeSheet();
};
document.getElementById('close').onclick = ()=> closeSheet();

// URL ?seed=
const q=new URLSearchParams(location.search);
if(q.has('seed')){ const s=q.get('seed'); box.value=s; setSeed(s); hint.style.display='none'; }
