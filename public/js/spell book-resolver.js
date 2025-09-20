// public/js/spellbook-resolver.js
// Loads one or more spellbook JSON files and resolves a seed into params.
// Core fields today: count, shape, tremor, tide, trails.
// Extras are passed through (camera, transitions, adhesion, etc.).

const SpellResolver = (() => {
  const RANGES = {
    tremor:[0,1.2], tide:[0,0.9], trails:[0.75,0.98]
  };
  const clamp=(v,[a,b])=>Math.max(a,Math.min(b,v));
  const isNum = x => typeof x === 'number' && !isNaN(x);

  let books = [];       // flat list of entries
  let patterns = [];    // compiled patterns
  let words = [];       // single-word
  let phrases = [];     // multi-word
  let aliases = [];     // alias list
  let deltas = [];      // deltas
  let modes  = [];      // modes

  function normalizeEntry(e){
    // Compile pattern helpers
    if(e.triggerType === 'pattern'){
      // Minimal supported patterns
      if(e.trigger === '<number>'){
        e._match = (s) => {
          const m = s.match(/\b(\d{1,5})\b/);
          return m ? [{start:m.index, end:m.index+m[0].length, value:parseInt(m[1],10)}] : null;
        };
      } else if (e.trigger === '<seconds>'){
        e._match = (s) => {
          const re = /\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i;
          const m = s.match(re); return m ? [{start:m.index, end:m.index+m[0].length, value:parseFloat(m[1])}] : null;
        };
      } else if (e.trigger === '<bpm>'){
        e._match = (s) => {
          const re = /\b(\d{2,3})\s*bpm\b/i;
          const m = s.match(re); return m ? [{start:m.index, end:m.index+m[0].length, value:parseInt(m[1],10)}] : null;
        };
      } else if (e.trigger === '<deg>'){
        e._match = (s) => {
          const re = /\b(\-?\d{1,3})\s*(?:°|deg|degrees?)\b/i;
          const m = s.match(re); return m ? [{start:m.index, end:m.index+m[0].length, value:parseInt(m[1],10)}] : null;
        };
      } else if (e.trigger === '<direction>'){
        e._match = (s) => {
          const m = s.match(/\b(left|right)\b/i);
          return m ? [{start:m.index, end:m.index+m[0].length, value:(m[1].toLowerCase()==='left'?-1:1)}] : null;
        };
      } else {
        // Unknown pattern token: treat as no-op
        e._match = () => null;
      }
    }
    return e;
  }

  function classify(){
    patterns = books.filter(b=>b.triggerType==='pattern');
    words    = books.filter(b=>b.triggerType==='word');
    phrases  = books.filter(b=>b.triggerType==='phrase');
    aliases  = books.filter(b=>b.triggerType==='alias');
    deltas   = books.filter(b=>b.triggerType==='delta');
    modes    = books.filter(b=>b.triggerType==='mode');
  }

  async function init(paths){
    // paths: array of URLs (e.g., ['/spellbooks/core.json', '/spellbooks/cinema.json'])
    const all = [];
    for (const p of paths){
      try{
        const r = await fetch(p, {cache:'no-store'});
        const arr = await r.json();
        arr.forEach(x=>all.push(normalizeEntry(x)));
      }catch(e){
        console.warn('Spellbook load failed:', p, e);
      }
    }
    books = all;
    classify();
    return SpellResolver;
  }

  // Merge helpers
  function applyEffect(out, eff){
    // Absolute fields (overwrite)
    for (const k of ['count','shape','mode']){
      if (k in eff) out[k] = eff[k];
    }
    // Motion + trails (overwrite unless set as delta elsewhere)
    for (const k of ['tremor','tide','trails']){
      if (k in eff && isNum(eff[k])) out[k] = eff[k];
    }
    // Camera/grade/etc: shallow merge
    if (eff.camera){ out.camera = Object.assign({}, out.camera||{}, eff.camera); }
    if (eff.grade){  out.grade  = Object.assign({}, out.grade ||{}, eff.grade);  }

    // Bio/extended scalars: sum then clamp 0..1 where sensible
    const SUM01 = ['adhesion','alignment','separation','chemotaxis','variation','viscosity','energy','glow','flow','quorum'];
    for (const k of SUM01){
      if (k in eff && isNum(eff[k])){
        out[k] = clamp((out[k]||0) + eff[k], [0,1]);
      }
    }
    // Rates: max in 0..1
    const RATE01 = ['divisionRate','deathRate','branchRate'];
    for (const k of RATE01){
      if (k in eff && isNum(eff[k])){
        out[k] = Math.max(out[k]||0, clamp(eff[k],[0,1]));
      }
    }
    // Flags (OR semantics)
    const FLAGS = ['divide','die','branch','dla','morphogenesis','wavefront','replicate','differentiate','lineageTrace','montage','snapToBeat','holdMs'];
    for (const k of FLAGS){
      if (k in eff){ out[k] = Boolean(out[k] || eff[k]); }
    }
    // Misc passthrough
    for (const k of Object.keys(eff)){
      if (!(k in out) && !['camera','grade'].includes(k) && !['count','shape','mode','tremor','tide','trails'].includes(k)){
        out[k] = eff[k];
      }
    }
  }

  function applyDelta(out, eff){
    if ('tremor' in eff)  out.tremor = clamp((out.tremor ?? 0.15) + eff.tremor, RANGES.tremor);
    if ('tide'   in eff)  out.tide   = clamp((out.tide   ?? 0.18) + eff.tide,   RANGES.tide);
    if ('trails' in eff)  out.trails = clamp((out.trails ?? 0.92) + eff.trails, RANGES.trails);
  }

  function resolve(seed){
    const s = (seed||'').toLowerCase();

    // Start with sane defaults
    const out = { count: 400, shape: 'none', tremor: 0.45, tide: 0.45, trails: 0.90 };

    // 1) Patterns (set numbers, seconds, bpm, etc.)
    for (const p of patterns){
      const hits = p._match ? p._match(s) : null;
      if (!hits) continue;
      for (const h of hits){
        const eff = JSON.parse(JSON.stringify(p.effect));
        if ('<int>' in JSON.stringify(eff) || '<float>' in JSON.stringify(eff) || '<-1|1>' in JSON.stringify(eff)){
          // replace placeholders
          const replace = (obj) => {
            for (const k in obj){
              const v = obj[k];
              if (typeof v === 'string'){
                if (v === '<int>' || v === '<float>' || v === '<-1|1>') obj[k] = h.value;
              } else if (v && typeof v === 'object') replace(v);
            }
          };
          replace(eff);
        }
        applyEffect(out, eff);
      }
    }

    // 2) Phrases (longer first to override words)
    for (const e of phrases){
      if (s.includes(e.trigger)) applyEffect(out, e.effect);
    }

    // 3) Words / Aliases
    for (const e of words){ if (s.includes(e.trigger)) applyEffect(out, e.effect); }
    for (const e of aliases){ if (s.includes(e.trigger)) applyEffect(out, e.effect); }

    // 4) Deltas (additive)
    for (const e of deltas){ if (s.includes(e.trigger)) applyDelta(out, e.effect); }

    // 5) Modes last
    for (const e of modes){ if (s.includes(e.trigger)) applyEffect(out, e.effect); }

    // Post-process: bpm→beatMs
    if (isNum(out.bpm) && !isNum(out.beatMs)) out.beatMs = 60000/Math.max(1,out.bpm);

    return out;
  }

  return { init, resolve };
})();

export default SpellResolver;
