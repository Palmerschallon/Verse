// Minimal canvas2D swarm renderer that honors resolver params.
// Supports: count, tremor, tide, trails, shape (ring/spiral/wave/grid/lattice/hex/triangle/square/rose),
// alignment, variation, falseColor/hue. Meta-events: birth/collapse/phase (lightweight stubs).

export function makeEngine(canvas){
  const ctx = canvas.getContext('2d', { alpha:false });
  let dpr=1, W=0, H=0;
  function fit(){
    dpr = Math.max(1, Math.min(3, devicePixelRatio||1));
    W = Math.floor(innerWidth*dpr); H = Math.floor(innerHeight*dpr);
    canvas.width = W; canvas.height = H;
    canvas.style.width = innerWidth+'px'; canvas.style.height = innerHeight+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', fit, {passive:true}); fit();

  const state = {
    params: { count: 400, tremor: 0.1, tide: 0.08, trails: 0.95, alignment: 0.5, variation: 0.0, shape: 'ring' },
    parts: [],
    t: 0,
    color: { r:255,g:255,b:255 }
  };

  // seeded noise helper
  let seed = 1;
  function setSeed(s){ seed = (s>>>0)||1; }
  function rnd(){ seed = (seed + 0x6D2B79F5)|0; let t = Math.imul(seed ^ (seed>>>15), seed|1); t ^= t + Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; }

  function spawn(n){
    state.parts.length = 0;
    for(let i=0;i<n;i++){
      state.parts.push({
        x: rnd()*innerWidth,
        y: rnd()*innerHeight,
        vx: (rnd()*2-1)*0.2,
        vy: (rnd()*2-1)*0.2,
        id: i
      });
    }
  }

  function pathSamples(name){
    const cx=innerWidth/2, cy=innerHeight/2;
    const R = Math.min(innerWidth, innerHeight)*0.32;
    const N=360, pts=[];
    const add = p=>pts.push(p);
    switch(name){
      case 'ring':
        for(let i=0;i<N;i++){ const a=2*Math.PI*i/N; add({x:cx+R*Math.cos(a),y:cy+R*Math.sin(a)}); } break;
      case 'spiral': {
        const turns=2.4;
        for(let i=0;i<N;i++){ const t=i/(N-1); const a=2*Math.PI*turns*t, r=R*0.1+R*0.9*t; add({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}); }
      } break;
      case 'wave': {
        const A=R*0.33,k=2;
        for(let i=0;i<N;i++){ const t=i/(N-1); const x=(innerWidth*0.12)+t*(innerWidth*0.76); add({x, y:cy + A*Math.sin(2*Math.PI*k*t)}); }
      } break;
      case 'grid': {
        const step=Math.max(18,R*0.18);
        for(let y=cy-R;y<=cy+R;y+=step) for(let x=cx-R;x<=cx+R;x+=step) add({x,y});
      } break;
      case 'lattice': {
        const step=Math.max(22,R*0.18);
        for(let yi=0,y=cy-R;y<=cy+R;yi++,y+=step) for(let xi=0,x=cx-R;x<=cx+R;xi++,x+=step) add({x:x+(yi%2? step/2:0),y});
      } break;
      case 'hex': {
        const a=Math.max(16,R*0.12), w=Math.sqrt(3)*a, h=1.5*a;
        for(let y=cy-R;y<=cy+R;y+=h){ for(let i=0,x=cx-R;x<=cx+R;i++,x+=w){ const off=(Math.round((y-cy+R)/h)%2? w/2:0); add({x:x+off,y}); } }
      } break;
      case 'triangle': {
        const A={x:cx,y:cy-R},B={x:cx-R*0.9,y:cy+R*0.9},C={x:cx+R*0.9,y:cy+R*0.9};
        const edge=(P,Q)=>{ for(let i=0;i<N/3;i++){ const t=i/(N/3-1); add({x:P.x+(Q.x-P.x)*t,y:P.y+(Q.y-P.y)*t}); } };
        edge(A,B); edge(B,C); edge(C,A);
      } break;
      case 'square': {
        const L=R*0.9,left=cx-L,right=cx+L,top=cy-L,bot=cy+L;
        const edge=(P,Q,M)=>{ for(let i=0;i<M;i++){ const t=i/(M-1); add({x:P.x+(Q.x-P.x)*t,y:P.y+(Q.y-P.y)*t}); } };
        edge({x:left,y:top},{x:right,y:top},N/4);
        edge({x:right,y:top},{x:right,y:bot},N/4);
        edge({x:right,y:bot},{x:left,y:bot},N/4);
        edge({x:left,y:bot},{x:left,y:top},N/4);
      } break;
      case 'rose': {
        const k=5;
        for(let i=0;i<N;i++){ const th=2*Math.PI*i/N; const r=R*Math.cos(k*th); add({x:cx+r*Math.cos(th), y:cy+r*Math.sin(th)}); }
      } break;
      default: return [];
    }
    return pts;
  }

  let cached = { name: null, pts: [] };
  function nearestForce(p, name){
    if(name!==cached.name){ cached.name=name; cached.pts = pathSamples(name); }
    const pts = cached.pts;
    if(!pts.length) return {fx:0,fy:0};

    // stride search
    let bx=0, by=0, bd=1e9;
    for(let i=0;i<pts.length;i+=3){
      const s=pts[i]; const dx=s.x-p.x, dy=s.y-p.y; const d=dx*dx+dy*dy;
      if(d<bd){bd=d; bx=dx; by=dy;}
    }
    const pull = 0.0009 + 0.0014*(1 - Math.min(1, bd/(innerWidth*innerHeight)));
    return { fx: bx*pull, fy: by*pull };
  }

  function applyParams(params){
    state.params = { ...state.params, ...params };
    // color
    if(params.falseColor && typeof params.hue === 'number'){
      const h = params.hue%360, s=0.08, l=0.92; // very subtle
      const c = (1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
      let r=0,g=0,b=0;
      if(h<60){ r=c; g=x; } else if(h<120){ r=x; g=c; } else if(h<180){ g=c; b=x; }
      else if(h<240){ g=x; b=c; } else if(h<300){ r=x; b=c; } else { r=c; b=x; }
      state.color = { r:Math.round((r+m)*255), g:Math.round((g+m)*255), b:Math.round((b+m)*255) };
    } else {
      state.color = { r:255,g:255,b:255 };
    }
    // respawn on count change
    spawn(Math.max(0, Math.floor(state.params.count)));
  }

  function applyMeta(eff){
    const kind = String(eff.event||'').toLowerCase();
    if(kind==='birth' || kind==='reset'){ spawn(Math.max(0, Math.floor(state.params.count))); }
    else if(kind==='collapse' || kind==='dissolution'){ state.params.count = 0; state.parts.length=0; }
    else if(kind==='phase'){ /* could flip dynamics here */ }
    // extend as needed
  }

  function kick(){ if(!running) loop(); }

  // main loop
  let running=false;
  function loop(){
    running=true;
    state.t += 16;

    // trails / persistence
    const fade = state.params.trails ?? 0.95;
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle = `rgba(0,0,0,${1 - fade})`;
    ctx.fillRect(0,0,innerWidth,innerHeight);

    // draw
    if(state.parts.length){
      const {tremor=0.1,tide=0.08,shape='ring',alignment=0.5,variation=0.0} = state.params;
      const tideT = state.t * (0.0006 + tide*0.0012);

      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${state.color.r},${state.color.g},${state.color.b},0.95)`;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for(const p of state.parts){
        // base field (slow rotation)
        const c = Math.cos(tideT), s = Math.sin(tideT);
        let ax = p.vx*c - p.vy*s, ay = p.vx*s + p.vy*c;

        // noise tremor
        const n = Math.sin((p.id*12.9898 + state.t*0.013)*43758.5453);
        ax += (n)*tremor*0.6 + (rnd()*2-1)*variation*0.2;
        ay += (n*0.7)*tremor*0.6 + (rnd()*2-1)*variation*0.2;

        // attraction to shape
        if(shape && shape!=='none'){
          const f = nearestForce(p, shape);
          ax += f.fx * alignment;
          ay += f.fy * alignment;
        }

        // integrate
        p.vx = p.vx*0.96 + ax*0.6;
        p.vy = p.vy*0.96 + ay*0.6;
        const nx = p.x + p.vx, ny = p.y + p.vy;
        ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny);
        p.x = nx; p.y = ny;

        // wrap
        if(p.x<0) p.x+=innerWidth; if(p.x>innerWidth) p.x-=innerWidth;
        if(p.y<0) p.y+=innerHeight; if(p.y>innerHeight) p.y-=innerHeight;
      }
      ctx.stroke();
    }

    requestAnimationFrame(loop);
  }

  // public API
  return {
    applyParams,
    applyMeta,
    applySilence: (_s)=>{/* stub */},
    applyMask: (_m)=>{/* stub */},
    kick,
    setSeed
  };
}
