export const ENGINE_VERSION = "2024.05-seed";

export function compileSeed(seed, mode, engineVersion = ENGINE_VERSION) {
  const tokens = tokenize(seed);
  const params = mode === "seed" ? compileSeedMode(tokens) : compileBloomMode(tokens);
  const signature = sha256(`${seed}|${engineVersion}|${JSON.stringify(params)}`);
  return { params, engineVersion, signature };
}

export const DEFAULT_PARAMS = {
  shape: "field",
  tide: 0.5,
  tremor: 0.2,
  trails: 0.6,
  pull: 0.4,
  count: 64,
  herald: false,
  tempoHz: 1.0,
};

const TOKEN_EFFECTS = {
  ring: { set: { shape: "circle" }, delta: { pull: 0.2 } },
  spiral: { set: { shape: "spiral" }, delta: { tide: 0.25 } },
  wave: { set: { shape: "wave" } },
  line: { set: { shape: "line" } },
  static: { delta: { tremor: 0.25 } },
  noise: { delta: { tremor: 0.25 } },
  scatter: { delta: { tremor: 0.25 } },
  slow: { set: { tide: 0.25 } },
  fast: { set: { tide: 0.75 } },
  calm: { set: { tide: 0.3 } },
  rush: { set: { tide: 0.85 } },
  short: { set: { trails: 0.3 } },
  long: { set: { trails: 0.85 } },
  ghost: { set: { trails: 0.95 } },
  trails: { delta: { trails: 0.1 } },
  few: { set: { count: 12 } },
  some: { set: { count: 32 } },
  many: { set: { count: 128 } },
  thousand: { set: { count: 1000 } },
  herald: { set: { herald: true, count: 1 } },
  red: { set: { herald: true, count: 1 } },
  tempo: { set: { tempoHz: 1.0 } },
  pulse: { set: { tempoHz: 2.0 } },
  breathe: { set: { tempoHz: 0.5 } },
  beat: { set: { tempoHz: 1.5 } },
};

const NUMBER_PATTERN = /^\d+$/;

function tokenize(seed) {
  return seed
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function compileSeedMode(tokens) {
  const accumulator = {
    shape: { value: DEFAULT_PARAMS.shape, conflict: false, applied: false },
    tide: { value: DEFAULT_PARAMS.tide, conflict: false, applied: false },
    tremor: { value: DEFAULT_PARAMS.tremor, conflict: false, applied: false },
    trails: { value: DEFAULT_PARAMS.trails, conflict: false, applied: false },
    pull: { value: DEFAULT_PARAMS.pull, conflict: false, applied: false },
    count: { value: DEFAULT_PARAMS.count, conflict: false, applied: false },
    herald: { value: DEFAULT_PARAMS.herald, conflict: false, applied: false },
    tempoHz: { value: DEFAULT_PARAMS.tempoHz, conflict: false, applied: false },
  };

  tokens.forEach((token) => {
    if (NUMBER_PATTERN.test(token)) {
      applySeedValue(accumulator, "count", parseInt(token, 10));
      return;
    }

    if (token === "tempo" && tokens.includes("hz")) {
      return;
    }

    const effect = TOKEN_EFFECTS[token];
    if (!effect) {
      return;
    }

    if (effect.set) {
      Object.entries(effect.set).forEach(([key, rawValue]) => {
        applySeedValue(accumulator, key, rawValue);
      });
    }

    if (effect.delta) {
      Object.entries(effect.delta).forEach(([key, delta]) => {
        const entry = accumulator[key];
        if (typeof entry.value === "number") {
          entry.value = clampNumber(entry.value + delta, 0, 1.5);
          entry.applied = true;
        }
      });
    }
  });

  Object.keys(accumulator).forEach((key) => {
    const entry = accumulator[key];
    if (entry.conflict) {
      entry.value = DEFAULT_PARAMS[key];
    }
  });

  return {
    shape: accumulator.shape.value,
    tide: accumulator.tide.value,
    tremor: accumulator.tremor.value,
    trails: accumulator.trails.value,
    pull: accumulator.pull.value,
    count: accumulator.count.value,
    herald: accumulator.herald.value,
    tempoHz: accumulator.tempoHz.value,
  };
}

function applySeedValue(accumulator, key, value) {
  const entry = accumulator[key];
  if (!entry.applied) {
    entry.value = value;
    entry.applied = true;
    return;
  }
  if (isSame(entry.value, value)) {
    return;
  }
  entry.conflict = true;
}

function compileBloomMode(tokens) {
  const accumulator = {
    shape: { contributions: [] },
    tide: { contributions: [] },
    tremor: { contributions: [] },
    trails: { contributions: [] },
    pull: { contributions: [] },
    count: { contributions: [] },
    herald: { contributions: [] },
    tempoHz: { contributions: [] },
  };

  tokens.forEach((token) => {
    if (NUMBER_PATTERN.test(token)) {
      accumulator.count.contributions.push({ value: parseInt(token, 10), weight: 1 });
      return;
    }

    if (token === "tempo" && tokens.includes("hz")) {
      return;
    }

    const effect = TOKEN_EFFECTS[token];
    if (!effect) {
      return;
    }

    if (effect.set) {
      Object.entries(effect.set).forEach(([key, rawValue]) => {
        accumulator[key].contributions.push({ value: rawValue, weight: 1 });
      });
    }

    if (effect.delta) {
      Object.entries(effect.delta).forEach(([key, delta]) => {
        const base = DEFAULT_PARAMS[key];
        accumulator[key].contributions.push({ value: base + delta, weight: 0.6 });
      });
    }
  });

  return {
    shape: pickMode(accumulator.shape, DEFAULT_PARAMS.shape),
    tide: blendNumeric(accumulator.tide, DEFAULT_PARAMS.tide),
    tremor: blendNumeric(accumulator.tremor, DEFAULT_PARAMS.tremor),
    trails: blendNumeric(accumulator.trails, DEFAULT_PARAMS.trails),
    pull: blendNumeric(accumulator.pull, DEFAULT_PARAMS.pull),
    count: blendNumeric(accumulator.count, DEFAULT_PARAMS.count, { clampMax: 2000 }),
    herald: blendBoolean(accumulator.herald, DEFAULT_PARAMS.herald),
    tempoHz: blendNumeric(accumulator.tempoHz, DEFAULT_PARAMS.tempoHz, { clampMax: 6 }),
  };
}

function pickMode(entry, fallback) {
  if (entry.contributions.length === 0) {
    return fallback;
  }
  const buckets = new Map();
  entry.contributions.forEach(({ value, weight }) => {
    buckets.set(value, (buckets.get(value) ?? 0) + weight);
  });
  let best = fallback;
  let bestWeight = -Infinity;
  buckets.forEach((weight, key) => {
    if (weight > bestWeight) {
      bestWeight = weight;
      best = key;
    }
  });
  return best;
}

function blendNumeric(entry, fallback, options = {}) {
  if (entry.contributions.length === 0) {
    return fallback;
  }
  let weightSum = 0;
  let weightedValue = 0;
  entry.contributions.forEach(({ value, weight }) => {
    weightSum += weight;
    weightedValue += value * weight;
  });
  const raw = weightSum > 0 ? weightedValue / weightSum : fallback;
  const min = options.clampMin ?? 0;
  const max = options.clampMax ?? 1.5;
  return clampNumber(raw, min, max);
}

function blendBoolean(entry, fallback) {
  if (entry.contributions.length === 0) {
    return fallback;
  }
  let score = fallback ? 0.5 : 0;
  entry.contributions.forEach(({ value, weight }) => {
    score += (value ? 1 : -1) * weight;
  });
  return score > 0.5;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isSame(current, next) {
  if (typeof current === "number" && typeof next === "number") {
    return Math.abs(current - next) < 1e-6;
  }
  return current === next;
}

function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hash = sha256Buffer(data);
  return Array.from(hash)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function sha256Buffer(data) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const padded = pad(data);
  const view = new DataView(padded.buffer);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.byteLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let i = 0; i < 64; i += 1) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < H.length; i += 1) {
    out[i * 4] = (H[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    out[i * 4 + 3] = H[i] & 0xff;
  }
  return out;
}

function pad(data) {
  const length = data.length;
  const withOne = new Uint8Array(length + 1);
  withOne.set(data);
  withOne[length] = 0x80;

  let paddedLength = withOne.length;
  while (paddedLength % 64 !== 56) {
    paddedLength += 1;
  }

  const padded = new Uint8Array(paddedLength + 8);
  padded.set(withOne);

  const bitLength = length * 8;
  for (let i = 0; i < 8; i += 1) {
    padded[paddedLength + 7 - i] = bitLength >>> (i * 8);
  }

  return padded;
}

function rightRotate(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}
