const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FAMILIES,
  BACKGROUNDS,
  INK,
  PARAM_SPECS,
  tintOf,
  identityOf,
  surfaceOf,
  stateOf,
  speedOf,
  viewAnglesOf,
} = require('./identity.js');

const SURFACE_FAMILIES = ['helix', 'loft', 'mobius'];

const manyIdentities = (prefix, count) => {
  const ids = Array.from({ length: count }, (unused, index) => `${prefix}-${index}`);
  return ids.map(identityOf);
};

test('a session always gets the same identity', () => {
  const first = identityOf('0f3c2a1e-6d7b-4c9a-9e21-5b8f0a4c7d10');
  const again = identityOf('0f3c2a1e-6d7b-4c9a-9e21-5b8f0a4c7d10');
  assert.deepEqual(first, again);
});

test('two sessions get different identities', () => {
  const first = identityOf('session-a');
  const second = identityOf('session-b');
  assert.notEqual(first.seed, second.seed);
});

test('the four forms of the Systems Kit exist', () => {
  assert.deepEqual(FAMILIES, ['chrome', 'helix', 'loft', 'mobius']);
});

test('twenty-four fixed backgrounds: twelve hues, each in a light and a dark tone', () => {
  const distinct = new Set(BACKGROUNDS);
  const luminanceOf = hex => {
    const value = Number.parseInt(hex.slice(1), 16);
    return ((value >> 16) & 255) + ((value >> 8) & 255) + (value & 255);
  };
  assert.equal(BACKGROUNDS.length, 24);
  assert.equal(distinct.size, 24);
  assert.ok(BACKGROUNDS.every(color => /^#[0-9a-f]{6}$/.test(color)));
  for (let hue = 0; hue < 12; hue++) {
    const light = BACKGROUNDS[hue * 2];
    const dark = BACKGROUNDS[hue * 2 + 1];
    assert.ok(luminanceOf(light) > luminanceOf(dark), `hue ${hue}`);
  }
});

test('every family and every background is used across many sessions', () => {
  const identities = manyIdentities('session', 800);
  const usedFamilies = [...new Set(identities.map(identity => identity.family))].sort();
  const usedBackgrounds = [...new Set(identities.map(identity => identity.background))].sort();
  assert.deepEqual(usedFamilies, [...FAMILIES].sort());
  assert.deepEqual(usedBackgrounds, [...BACKGROUNDS].sort());
});

test('a conversation has one background, which is its tint, and no colour palette', () => {
  const identity = identityOf('tint-check');
  assert.ok(BACKGROUNDS.includes(identity.background));
  assert.equal(tintOf('tint-check'), identity.background);
  assert.equal(identity.palette, undefined);
});

test('an empty or missing id still draws an identity', () => {
  const empty = identityOf('');
  const missing = identityOf(undefined);
  assert.equal(empty.key, 'sans-identifiant');
  assert.deepEqual(empty, missing);
  assert.ok(FAMILIES.includes(empty.family));
});

test('shared settings stay within their bounds', () => {
  for (const identity of manyIdentities('bounds', 200)) {
    assert.ok(identity.tempo >= 0.7 && identity.tempo <= 1.3);
    assert.ok(identity.direction === 1 || identity.direction === -1);
  }
});

const inRange = (spec, value) => {
  if (spec.choices) return spec.choices.includes(value);
  const isInside = value >= spec.min && value <= spec.max;
  return spec.isInteger ? isInside && Number.isInteger(value) : isInside;
};

const extentOf = spec => (spec.choices ? [Math.min(...spec.choices), Math.max(...spec.choices)] : [spec.min, spec.max]);

test('each form gets its own settings, all inside their declared bounds', () => {
  const identities = manyIdentities('family', 600);
  for (const identity of identities) {
    const specs = PARAM_SPECS[identity.family];
    assert.deepEqual(Object.keys(identity.params).sort(), Object.keys(specs).sort(), identity.family);
    for (const [key, spec] of Object.entries(specs)) {
      assert.ok(inRange(spec, identity.params[key]), `${identity.family}.${key} = ${identity.params[key]}`);
    }
  }
});

test('across many conversations every setting covers at least eighty percent of its range', () => {
  const identities = manyIdentities('coverage', 800);
  for (const family of FAMILIES) {
    const members = identities.filter(identity => identity.family === family);
    for (const [key, spec] of Object.entries(PARAM_SPECS[family])) {
      const [low, high] = extentOf(spec);
      const values = members.map(identity => identity.params[key]);
      const spread = (Math.max(...values) - Math.min(...values)) / (high - low);
      assert.ok(spread >= 0.8, `${family}.${key} covers ${spread}`);
    }
  }
});

test('two conversations of the same form differ a lot: median distance of at least thirty percent', () => {
  const identities = manyIdentities('variety', 600);
  for (const family of FAMILIES) {
    const members = identities.filter(identity => identity.family === family).slice(0, 40);
    const entries = Object.entries(PARAM_SPECS[family]);
    const distances = [];
    for (let first = 0; first < members.length; first++) {
      for (let second = first + 1; second < members.length; second++) {
        const parts = entries.map(([key, spec]) => {
          const [low, high] = extentOf(spec);
          return Math.abs(members[first].params[key] - members[second].params[key]) / (high - low);
        });
        const mean = parts.reduce((sum, part) => sum + part, 0) / parts.length;
        distances.push(mean);
      }
    }
    distances.sort((a, b) => a - b);
    const median = distances[Math.floor(distances.length / 2)];
    assert.ok(median >= 0.3, `${family} median ${median}`);
  }
});

test('every surface keeps finite, bounded facets whatever the moment', () => {
  const identities = manyIdentities('surface', 600);
  const surfaced = identities.filter(identity => SURFACE_FAMILIES.includes(identity.family));
  const families = new Set(surfaced.map(identity => identity.family));
  assert.equal(families.size, SURFACE_FAMILIES.length);
  for (const identity of surfaced.slice(0, 60)) {
    for (const phase of [0, 3.7, 40, -25]) {
      const surface = surfaceOf(identity, phase);
      const quadCount = surface.nu * surface.nv;
      assert.ok(quadCount > 0);
      const xs = [...surface.sx];
      const ys = [...surface.sy];
      assert.ok(xs.every(Number.isFinite), `${identity.family} x`);
      assert.ok(ys.every(Number.isFinite), `${identity.family} y`);
      assert.ok(xs.every(x => Math.abs(x - 50) < 75), `${identity.family} x bound`);
      assert.ok(ys.every(y => Math.abs(y - 50) < 75), `${identity.family} y bound`);
      const depths = [...surface.depth];
      const order = [...surface.order];
      const sortedDepths = order.map(index => depths[index]);
      const isFarFirst = sortedDepths.every((depth, index) => index === 0 || sortedDepths[index - 1] >= depth);
      const isPermutation = new Set(order).size === quadCount;
      assert.ok(isFarFirst, `${identity.family} order`);
      assert.ok(isPermutation, `${identity.family} permutation`);
    }
  }
});

test('every facet has a shadow between 0 and 1, and every volume has ink silhouette edges', () => {
  const identities = manyIdentities('shadows', 300);
  const surfaced = identities.filter(identity => SURFACE_FAMILIES.includes(identity.family));
  for (const identity of surfaced.slice(0, 40)) {
    const surface = surfaceOf(identity, 1.5);
    const quadCount = surface.nu * surface.nv;
    const shadows = [...surface.shadow];
    const edges = [...surface.silhouette];
    const lit = shadows.filter(shadow => shadow < 0.4).length;
    const shaded = shadows.filter(shadow => shadow > 0.6).length;
    assert.equal(shadows.length, quadCount);
    assert.ok(shadows.every(shadow => shadow >= 0 && shadow <= 1), identity.family);
    assert.ok(edges.some(mask => mask !== 0), `${identity.family} has no silhouette`);
    assert.ok(lit > 0 && shaded > 0, `${identity.family} is flat: ${lit} lit, ${shaded} shaded`);
  }
});

test('the ink is the near-black of the Systems Kit', () => {
  assert.equal(INK, '#17181b');
});

test('every known status maps to a motion state', () => {
  const expected = {
    permission: 'waiting',
    done: 'waiting',
    thinking: 'working',
    writing: 'working',
    tool: 'working',
    working: 'working',
    external: 'waiting',
    aborted: 'rest',
    error: 'rest',
    opened: 'rest',
    idle: 'rest',
    closed: 'rest',
    archived: 'rest',
    seen: 'rest',
    blocked: 'rest',
    later: 'rest',
  };
  for (const [status, state] of Object.entries(expected)) {
    const actual = stateOf(status);
    assert.equal(actual, state, status);
  }
});

test('motion is faster when the session waits for you, slowest at rest', () => {
  const waiting = speedOf('waiting');
  const working = speedOf('working');
  const rest = speedOf('rest');
  const unknown = speedOf('nimporte');
  assert.ok(waiting > working);
  assert.ok(working > rest);
  assert.ok(rest > 0);
  assert.equal(unknown, rest);
});

test('the view angles follow the phase of every family', () => {
  for (const family of FAMILIES) {
    const identity = manyIdentities('angles', 40).find(candidate => candidate.family === family);
    const start = viewAnglesOf(identity, 0);
    const later = viewAnglesOf(identity, 5);
    assert.equal(start.yaw, identity.params.yaw, family);
    assert.notEqual(later.yaw, start.yaw, family);
    assert.ok(Number.isFinite(later.tilt), family);
  }
});

test('a pose offset turns the drawn volume, a null pose changes nothing', () => {
  const identity = manyIdentities('pose', 40).find(candidate => candidate.family === 'mobius');
  const plain = Float32Array.from(surfaceOf(identity, 1.5).sx);
  const same = Float32Array.from(surfaceOf(identity, 1.5, { yaw: 0, tilt: 0 }).sx);
  const turned = Float32Array.from(surfaceOf(identity, 1.5, { yaw: 0.8, tilt: -0.3 }).sx);
  assert.deepEqual(same, plain);
  assert.notDeepEqual(turned, plain);
});

test('turning by the gap to the face pose lands exactly on the face pose', () => {
  const { faceGapOf, FACE_POSES } = require('./identity-motion.js');
  const identity = manyIdentities('face', 40).find(candidate => candidate.family === 'helix');
  const current = viewAnglesOf(identity, 3.2);
  const gap = faceGapOf('helix', current);
  const landed = viewAnglesOf(identity, 3.2);
  assert.ok(Math.abs(landed.tilt + gap.tiltGap - FACE_POSES.helix.tilt) < 1e-9);
  assert.ok(Math.abs(Math.cos(landed.yaw + gap.yawGap) - Math.cos(FACE_POSES.helix.yaw)) < 1e-9);
});
