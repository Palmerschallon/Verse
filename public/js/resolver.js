/* public/js/resolver.js
   Verse Resolver — minimal, deterministic, book-driven.
   - Loads all spellbooks from spellbooks/index.json
   - Parses text into tokens
   - Matches triggers (word | phrase | alias | wildcard | fallback | meta | override)
   - Merges plain effects into params; routes evented effects to typed buckets
   - No rendering here: return an intent bundle the engine can apply.
*/

// ---------- small utilities ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hash32 = (s) => { // xmur3-lite
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
};
const seeded = (seed) => { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- loader ----------
const SpellLibrary = {
  loaded: false,
  books: [],              // raw arrays of entries
  index: [],              // [{trigger, type, effect, domain, tags}]
  precedence: [],         // optional override via Book of Laws
};

export async function loadBooks() {
  if (SpellLibrary.loaded) return SpellLibrary;

  // 1) meta-book list
  const meta = await fetch('spellbooks/index.json').then(r => r.json());
  const files = meta.books || [];

  // 2) fetch all books
  const bookJSONs = await Promise.all(
    files.map(f => fetch('spellbooks/' + f).then(r => r.json()))
  );

  // 3) flatten to index
  SpellLibrary.books = bookJSONs;
  SpellLibrary.index = bookJSONs.flat().map(entry => ({
    trigger: entry.trigger,
    type: entry.triggerType || 'word',
    effect: entry.effect || {},
    domain: entry.domain || 'unknown',
    tags: entry.tags || []
  }));

  SpellLibrary.loaded = true;
  return SpellLibrary;
}

// ---------- matching ----------
function tokenize(text) {
  // words (keep numbers), and phrases via raw text search later
  const clean = text.toLowerCase();
  const words = clean.match(/[a-z0-9]+/g) || [];
  return { clean, words };
}

function matchTriggers(text) {
  const { clean, words } = tokenize(text);

  const hits = [];

  for (const ent of SpellLibrary.index) {
    const t = ent.trigger.toLowerCase();

    switch (ent.type) {
      case 'word': {
        if (words.includes(t)) hits.push(ent);
        break;
      }
      case 'phrase': {
        if (clean.includes(t)) hits.push(ent);
        break;
      }
      case 'alias': {
        if (words.includes(t) || clean.includes(t)) hits.push(ent);
        break;
      }
      case 'wildcard': { // Babel: "*" means "always"
        if (t === '*') hits.push(ent);
        break;
      }
      case 'fallback': {
        // only use if we found nothing else; defer push
        break;
      }
      case 'meta':
      case 'override':
      default: {
        if (clean.includes(t)) hits.push(ent);
        break;
      }
    }
  }

  // add fallbacks if no hits at all
  if (hits.length === 0) {
    for (const ent of SpellLibrary.index) {
      if ((ent.type || '').toLowerCase() === 'fallback') hits.push(ent);
    }
  }

  return hits;
}

// ---------- merging plain params ----------
const DEFAULTS = {
  count: 400, tremor: 0.1, tide: 0.08, trails: 0.95, alignment: 0.5, variation: 0.0
};

function mergeParams(base, eff) {
  const out = { ...base };
  for (const k of Object.keys(eff)) {
    const v = eff[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...(out[k] || {}), ...v };
    } else {
      out[k] = v;
    }
  }
  // apply guards (may be overridden by Book of Laws)
  out.count = clamp(out.count ?? DEFAULTS.count, 0, (SpellLibrary.maxCount ?? 4000));
  out.trails = clamp(out.trails ?? DEFAULTS.trails, 0, 1);
  out.tremor = clamp(out.tremor ?? DEFAULTS.tremor, 0, 3);
  out.tide   = clamp(out.tide   ?? DEFAULTS.tide,   0, 3);
  return out;
}

// ---------- event dispatch stubs (you wire these to your engine) ----------
function applyLaw(laws, state) {
  // examples:
  if (laws?.guards?.maxCount) SpellLibrary.maxCount = laws.guards.maxCount;
  if (Array.isArray(laws?.precedence)) SpellLibrary.precedence = laws.precedence.slice(0);
  // … extend with merge modes, conflict winners, token weights, etc.
  state.laws.push(laws);
}

function applyMask(mask, state) {
  // e.g., route {from,to}, map rules, kaleido, stencil…
  state.masks.push(mask);
}

function applySilence(eff, state) {
  // mute all, attenuate, stop time, clear canvas flags, etc.
  state.silences.push(eff);
}

function handleSelf(eff, state) {
  // author/append/mine/persist/prune/introspect/permissions
  state.selfOps.push(eff);
}

function handleMetaEvent(eff, state) {
  // catastrophes and other meta-events: rupture, birth, collapse, phase, etc.
  state.metaEvents.push(eff);
}

// ---------- core resolve ----------
export async function resolve(text) {
  if (!SpellLibrary.loaded) await loadBooks();

  const seedHash = hash32(text || '');
  const rnd = seeded(seedHash);

  // buckets to return
  const state = {
    seedHash, rnd,
    params: { ...DEFAULTS },
    metaEvents: [],
    laws: [],
    masks: [],
    silences: [],
    selfOps: [],
    matches: []
  };

  // 1) find hits
  const hits = matchTriggers(text);
  state.matches = hits;

  // 2) optional domain precedence (Book of Laws)
  const ordered = (SpellLibrary.precedence && SpellLibrary.precedence.length)
    ? hits.slice().sort((a, b) => {
        const ai = SpellLibrary.precedence.indexOf(a.domain);
        const bi = SpellLibrary.precedence.indexOf(b.domain);
        return (ai === -1 ? 1e9 : ai) - (bi === -1 ? 1e9 : bi);
      })
    : hits;

  // 3) apply each effect
  for (const ent of ordered) {
    const eff = ent.effect || {};
    // wildcard hashing (Babel)
    if (ent.type === 'wildcard' && ent.trigger === '*') {
      if (eff.hashToCount) state.params.count = clamp(Math.floor((seedHash % 2000) + 100), 0, SpellLibrary.maxCount ?? 4000);
      if (eff.hashToShape) {
        const SHAPES = ['ring','spiral','wave','grid','lattice','hex','triangle','square','rose'];
        state.params.shape = SHAPES[seedHash % SHAPES.length];
      }
      if (eff.hashToColor) {
        state.params.falseColor = true;
        state.params.hue = (seedHash % 360);
      }
    }

    // dispatch on event (meta)
    if (eff.event) {
      const kind = String(eff.event).toLowerCase();
      if (kind === 'law')       applyLaw(eff.laws || {}, state);
      else if (kind === 'mask') applyMask(eff, state);
      else if (kind === 'silence') applySilence(eff, state);
      else if (kind === 'self') handleSelf(eff, state);
      else                      handleMetaEvent(eff, state);
      continue;
    }

    // otherwise: merge plain parameters
    state.params = mergeParams(state.params, eff);
  }

  // 4) gentle guardrails for naive text
  // numbers in text can explode counts; clamp once more
  state.params.count = clamp(state.params.count, 0, SpellLibrary.maxCount ?? 4000);

  return state;
}

// ---------- convenience: sync resolve for engines that already loaded books ----------
export function resolveSync(text) {
  if (!SpellLibrary.loaded) throw new Error('Call loadBooks() first');
  return resolve(text);
}
