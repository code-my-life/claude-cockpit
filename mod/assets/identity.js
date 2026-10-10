(function (root) {
  'use strict';

  const FAMILIES = ['chrome', 'helix', 'loft', 'mobius'];
  const HUE_COUNT = 12;
  const HUE_OFFSET = 10;
  const BACKGROUND_TONES = [{ saturation: 0.52, lightness: 0.62 }, { saturation: 0.52, lightness: 0.4 }];
  const INK = '#17181b';
  const SPEEDS = { waiting: 1.4, working: 0.6, rest: 0.08 };
  const WAITING_STATUSES = ['permission', 'done', 'external'];
  const WORKING_STATUSES = ['thinking', 'writing', 'tool', 'working'];
  const TAU = Math.PI * 2;
  const VIRTUAL = 100;
  const CENTER = VIRTUAL / 2;
  const CAMERA = 5;
  const LIGHT = (() => {
    const x = -0.72;
    const y = 0.6;
    const z = -0.4;
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length];
  })();

  const hashText = text => {
    let hash = 2166136261 >>> 0;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0x5bd1e995);
    hash ^= hash >>> 15;
    return hash >>> 0;
  };

  const createRandom = seed => {
    let state = seed | 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  };

  const between = (random, min, max) => min + random() * (max - min);
  const pick = (random, values) => values[Math.floor(random() * values.length)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const smooth = (from, to, value) => {
    const ratio = clamp((value - from) / (to - from), 0, 1);
    return ratio * ratio * (3 - 2 * ratio);
  };

  const hexOfHsl = (hue, saturation, lightness) => {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const sector = (hue % 360) / 60;
    const second = chroma * (1 - Math.abs((sector % 2) - 1));
    const shift = lightness - chroma / 2;
    const table = [[chroma, second, 0], [second, chroma, 0], [0, chroma, second], [0, second, chroma], [second, 0, chroma], [chroma, 0, second]];
    const [red, green, blue] = table[Math.floor(sector) % 6];
    const channels = [red, green, blue].map(channel => Math.round((channel + shift) * 255));
    const digits = channels.map(channel => channel.toString(16).padStart(2, '0'));
    return `#${digits.join('')}`;
  };

  const BACKGROUNDS = [];
  for (let hue = 0; hue < HUE_COUNT; hue++) {
    for (const tone of BACKGROUND_TONES) {
      const angle = HUE_OFFSET + (hue * 360) / HUE_COUNT;
      BACKGROUNDS.push(hexOfHsl(angle, tone.saturation, tone.lightness));
    }
  }

  const PARAM_SPECS = {
    chrome: {
      ringRadius: { min: 0.55, max: 1.05 },
      thickness: { min: 0.12, max: 0.36 },
      stretch: { min: 0.8, max: 1.2 },
      tilt: { min: 0.4, max: 1.5 },
      roll: { min: 0.1, max: 1.0 },
      dropCount: { min: 1, max: 6, isInteger: true },
      dropSize: { min: 0.2, max: 0.55 },
      dropSeed: { min: 0, max: 1 },
      yaw: { min: 0, max: TAU },
    },
    helix: {
      twists: { min: 2, max: 7, isInteger: true },
      halfWidth: { min: 0.2, max: 0.75 },
      stretch: { min: 0.7, max: 1.4 },
      tilt: { min: 0.45, max: 1.2 },
      yaw: { min: 0, max: TAU },
    },
    loft: {
      lobes: { min: 2, max: 9, isInteger: true },
      sweep: { min: 1, max: 4.2 },
      turn: { min: 0, max: TAU },
      girth: { min: 0.22, max: 0.6 },
      bulge: { min: 0.3, max: 1.6 },
      stage: { min: -0.6, max: 0.6 },
      yaw: { min: 0, max: TAU },
    },
    mobius: {
      twists: { choices: [1, 3, 5] },
      halfWidth: { min: 0.2, max: 0.62 },
      stretch: { min: 0.7, max: 1.4 },
      tilt: { min: 0.5, max: 1.3 },
      yaw: { min: 0, max: TAU },
    },
  };

  const valueOf = (random, spec) => {
    if (spec.choices) return pick(random, spec.choices);
    const value = between(random, spec.min, spec.max);
    return spec.isInteger ? Math.min(spec.max, Math.floor(value)) : value;
  };

  const paramsOf = (family, random) => {
    const params = {};
    for (const [key, spec] of Object.entries(PARAM_SPECS[family])) params[key] = valueOf(random, spec);
    return params;
  };

  const identityOf = engineId => {
    const key = String(engineId ?? '').trim() || 'sans-identifiant';
    const seed = hashText(key);
    const random = createRandom(seed);
    const family = FAMILIES[seed % FAMILIES.length];
    const direction = random() < 0.5 ? -1 : 1;
    const tempo = 0.7 + random() * 0.6;
    const background = pick(random, BACKGROUNDS);
    const params = paramsOf(family, random);
    return { key, seed, family, direction, tempo, background, params };
  };

  const stateOf = status => {
    if (WAITING_STATUSES.includes(status)) return 'waiting';
    if (WORKING_STATUSES.includes(status)) return 'working';
    return 'rest';
  };

  const speedOf = state => SPEEDS[state] ?? SPEEDS.rest;

  const tintOf = engineId => {
    const identity = identityOf(engineId);
    return identity.background;
  };

  const createGrid = (nu, nv, isWrapped) => {
    const vu = nu + 1;
    const vv = isWrapped ? nv : nv + 1;
    const vertices = vu * vv;
    const quads = nu * nv;
    const order = new Uint16Array(quads);
    for (let index = 0; index < quads; index++) order[index] = index;
    return {
      nu,
      nv,
      vu,
      vv,
      isWrapped,
      wx: new Float32Array(vertices),
      wy: new Float32Array(vertices),
      wz: new Float32Array(vertices),
      sx: new Float32Array(vertices),
      sy: new Float32Array(vertices),
      centers: new Float32Array(vu * 3),
      silhouette: new Uint8Array(quads),
      depth: new Float32Array(quads),
      shadow: new Float32Array(quads),
      order,
    };
  };

  const markSilhouette = (grid, isLoft) => {
    for (let i = 0; i < grid.nu; i++) {
      for (let j = 0; j < grid.nv; j++) {
        let mask = 0;
        if (isLoft) {
          if (i === 0) mask |= 8;
          if (i === grid.nu - 1) mask |= 2;
        } else {
          if (j === 0) mask |= 1;
          if (j === grid.nv - 1) mask |= 4;
        }
        grid.silhouette[i * grid.nv + j] = mask;
      }
    }
  };

  const NO_POSE = Object.freeze({ yaw: 0, tilt: 0 });
  // Vitesse de rotation et balancement de chaque famille à volume ; chrome a ses propres angles.
  const VIEW_SPECS = {
    helix: { turn: 0.45, sway: 0.12 },
    mobius: { turn: 0.6, sway: 0.16 },
    loft: { turn: 0.28, sway: 0.08, tilt: 0.55 },
  };
  const CHROME_PACE = 0.9;

  const chromeAnglesOf = (params, phase) => {
    const t = phase * CHROME_PACE;
    return { yaw: params.yaw + t * 0.2, tilt: params.tilt + 0.22 * Math.sin(t * 0.33) };
  };

  // Lacet et inclinaison de la vue à une phase donnée (sans réaction) : de quoi viser une pose de face.
  const viewAnglesOf = (identity, phase) => {
    const { family, params } = identity;
    if (family === 'chrome') return chromeAnglesOf(params, phase);
    const spec = VIEW_SPECS[family];
    return { yaw: params.yaw + phase * spec.turn, tilt: (spec.tilt ?? params.tilt) + spec.sway * Math.sin(phase * 0.4) };
  };

  const viewOf = (phase, tilt, sway, scale, turn, yawStart, pose = NO_POSE) => {
    const yaw = yawStart + phase * turn + pose.yaw;
    const pitch = tilt + sway * Math.sin(phase * 0.4) + pose.tilt;
    return { ca: Math.cos(yaw), sa: Math.sin(yaw), cxa: Math.cos(pitch), sxa: Math.sin(pitch), scale };
  };

  const cameraOf = (view, x, y, z, out) => {
    const x1 = x * view.ca + z * view.sa;
    const z1 = -x * view.sa + z * view.ca;
    out[0] = x1;
    out[1] = y * view.cxa - z1 * view.sxa;
    out[2] = y * view.sxa + z1 * view.cxa;
  };

  const scratch = new Float32Array(3);

  const place = (grid, index, view, x, y, z) => {
    cameraOf(view, x, y, z, scratch);
    const factor = CAMERA / (CAMERA + scratch[2]);
    grid.wx[index] = scratch[0];
    grid.wy[index] = scratch[1];
    grid.wz[index] = scratch[2];
    grid.sx[index] = CENTER + scratch[0] * view.scale * factor;
    grid.sy[index] = CENTER - scratch[1] * view.scale * factor;
  };

  const fillBand = (grid, view, halfWidth, twistsOf, stretch) => {
    for (let i = 0; i <= grid.nu; i++) {
      const angle = (TAU * i) / grid.nu;
      const turn = twistsOf(angle);
      const cosTurn = Math.cos(turn);
      const sinTurn = Math.sin(turn);
      for (let j = 0; j <= grid.nv; j++) {
        const across = ((j / grid.nv) * 2 - 1) * halfWidth;
        const radius = 1 + across * cosTurn;
        place(grid, i * grid.vv + j, view, radius * Math.cos(angle) * stretch, across * sinTurn, radius * Math.sin(angle));
      }
    }
  };

  const spineOf = (s, sweep, turn, out) => {
    const arc = (s - 0.5) * sweep;
    const x = 1.5 * Math.sin(arc);
    const y = 1.25 * Math.cos(arc) - 0.8;
    out[0] = x * Math.cos(turn) - y * Math.sin(turn);
    out[1] = x * Math.sin(turn) + y * Math.cos(turn);
  };

  const fillLoft = (grid, view, params, phase) => {
    const { lobes, sweep, turn, girth, bulge, stage: stageShift } = params;
    const before = [0, 0];
    const after = [0, 0];
    const here = [0, 0];
    const rows = grid.vu;
    for (let i = 0; i < rows; i++) {
      const s = i / (rows - 1);
      spineOf(s - 0.004, sweep, turn, before);
      spineOf(s + 0.004, sweep, turn, after);
      spineOf(s, sweep, turn, here);
      const tx = after[0] - before[0];
      const ty = after[1] - before[1];
      const length = Math.hypot(tx, ty) || 1;
      const normalX = ty / length;
      const normalY = -tx / length;
      const stage = clamp(s * 2.5 - 0.35 + stageShift + 0.95 * Math.sin(0.3 * phase), 0, 2);
      const base = girth + 0.24 * Math.pow(Math.sin(Math.PI * s), bulge) * (1 + 0.2 * Math.sin(0.3 * phase + s * 5));
      const squareness = 2 + 3.4 * smooth(0.1, 1, stage) * (1 - smooth(1, 1.9, stage));
      const wave = 0.42 * smooth(1.05, 1.9, stage);
      const spin = 1.3 * s + 0.2 * phase;
      cameraOf(view, here[0], here[1], 0, scratch);
      grid.centers[i * 3] = scratch[0];
      grid.centers[i * 3 + 1] = scratch[1];
      grid.centers[i * 3 + 2] = scratch[2];
      for (let j = 0; j < grid.vv; j++) {
        const angle = (j / grid.vv) * TAU;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const superellipse = Math.pow(Math.pow(Math.abs(cosine), squareness) + Math.pow(Math.abs(sine), squareness), -1 / squareness);
        const radius = base * superellipse * (1 + wave * Math.cos(lobes * angle + spin));
        place(grid, i * grid.vv + j, view, here[0] + radius * sine * normalX, here[1] + radius * sine * normalY, radius * cosine);
      }
    }
  };

  const vertexOf = (grid, i, j) => i * grid.vv + (j % grid.vv);

  const shadeGrid = grid => {
    const isClosed = grid.isWrapped;
    for (let i = 0; i < grid.nu; i++) {
      for (let j = 0; j < grid.nv; j++) {
        const quad = i * grid.nv + j;
        const a = vertexOf(grid, i, j);
        const b = vertexOf(grid, i + 1, j);
        const d = vertexOf(grid, i + 1, j + 1);
        const e = vertexOf(grid, i, j + 1);
        const ux = grid.wx[b] - grid.wx[a];
        const uy = grid.wy[b] - grid.wy[a];
        const uz = grid.wz[b] - grid.wz[a];
        const vx = grid.wx[e] - grid.wx[a];
        const vy = grid.wy[e] - grid.wy[a];
        const vz = grid.wz[e] - grid.wz[a];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length;
        ny /= length;
        nz /= length;
        let isInside = false;
        if (isClosed) {
          const qx = grid.wx[a] - grid.centers[i * 3];
          const qy = grid.wy[a] - grid.centers[i * 3 + 1];
          const qz = grid.wz[a] - grid.centers[i * 3 + 2];
          if (nx * qx + ny * qy + nz * qz < 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
          const facing = nx * -grid.wx[a] + ny * -grid.wy[a] + nz * (-CAMERA - grid.wz[a]);
          isInside = facing <= 0;
        } else {
          const facing = nx * -grid.wx[a] + ny * -grid.wy[a] + nz * (-CAMERA - grid.wz[a]);
          if (facing < 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
        }
        const lam = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
        const lit = smooth(-0.15, 0.95, lam);
        const shadow = 1 - lit;
        grid.shadow[quad] = isInside ? Math.min(1, shadow * 0.75 + 0.3) : shadow;
        grid.depth[quad] = (grid.wz[a] + grid.wz[d]) / 2;
      }
    }
    const { depth } = grid;
    grid.order.sort((first, second) => depth[second] - depth[first]);
  };

  const surfaces = new Map();

  const buildGrid = identity => {
    const { family } = identity;
    const grid = family === 'loft' ? createGrid(13, 24, true) : createGrid(96, family === 'helix' ? 2 : 3, false);
    markSilhouette(grid, family === 'loft');
    return grid;
  };

  const FIT_SAMPLES = 10;
  const FIT_RADIUS = 45;
  const FIT_MAX_SCALE = 60;
  const FIT_SPANS = { helix: TAU / 0.45, mobius: TAU / 0.6, loft: 22.4 };

  const fillSurface = (identity, grid, phase, scale, pose) => {
    const { family, params } = identity;
    const spec = VIEW_SPECS[family];
    const view = viewOf(phase, spec.tilt ?? params.tilt, spec.sway, scale, spec.turn, params.yaw, pose);
    if (family === 'helix') fillBand(grid, view, params.halfWidth, angle => (params.twists * (angle - Math.PI)) / 2, params.stretch);
    else if (family === 'mobius') fillBand(grid, view, params.halfWidth, angle => (params.twists * angle) / 2, params.stretch);
    else fillLoft(grid, view, params, phase);
  };

  const fitOf = (identity, grid) => {
    let farthest = 1e-6;
    for (let step = 0; step < FIT_SAMPLES; step++) {
      const phase = (FIT_SPANS[identity.family] * step) / FIT_SAMPLES;
      fillSurface(identity, grid, phase, 1, NO_POSE);
      for (let index = 0; index < grid.sx.length; index++) {
        const reach = Math.hypot(grid.sx[index] - CENTER, grid.sy[index] - CENTER);
        farthest = Math.max(farthest, reach);
      }
    }
    return Math.min(FIT_MAX_SCALE, FIT_RADIUS / farthest);
  };

  const surfaceOf = (identity, phase, pose = NO_POSE) => {
    if (identity.family === 'chrome') return null;
    let grid = surfaces.get(identity.key);
    if (grid === undefined) {
      grid = buildGrid(identity);
      grid.fit = fitOf(identity, grid);
      surfaces.set(identity.key, grid);
    }
    fillSurface(identity, grid, phase, grid.fit, pose);
    shadeGrid(grid);
    return grid;
  };

  const api = { FAMILIES, BACKGROUNDS, INK, PARAM_SPECS, SPEEDS, identityOf, tintOf, stateOf, speedOf, surfaceOf, viewAnglesOf, chromeAnglesOf };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  const Motion = root.CockpitIdentityMotion;
  // 15 images/s au repos ; l'instance qui réagit monte à Motion.REACT_FPS, puis revient.
  const FPS = 15;
  const CLIP_RADIUS = 50;
  const REDRAW_PHASE = 0.02;
  const REDRAW_MOTION = 0.002;
  const phases = new Map();
  const instances = [];
  let isLooping = false;
  let isPaused = false;
  let lastFrameAt = 0;
  const calmQuery = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const prefersCalm = () => Boolean(calmQuery && calmQuery.matches);
  const clock = () => root.performance.now();

  const visibility = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(entries => {
      for (const entry of entries) {
        const instance = instances.find(candidate => candidate.canvas === entry.target);
        if (instance) instance.isVisible = entry.isIntersecting;
      }
    });

  const traceEdges = (context, grid, mask, a, b, d, e) => {
    context.beginPath();
    if (mask & 1) { context.moveTo(grid.sx[a], grid.sy[a]); context.lineTo(grid.sx[b], grid.sy[b]); }
    if (mask & 2) { context.moveTo(grid.sx[b], grid.sy[b]); context.lineTo(grid.sx[d], grid.sy[d]); }
    if (mask & 4) { context.moveTo(grid.sx[d], grid.sy[d]); context.lineTo(grid.sx[e], grid.sy[e]); }
    if (mask & 8) { context.moveTo(grid.sx[e], grid.sy[e]); context.lineTo(grid.sx[a], grid.sy[a]); }
    context.stroke();
  };

  const hatchFractionsOf = shadow => {
    if (shadow > 0.9) return [0.2, 0.4, 0.6, 0.8];
    if (shadow > 0.76) return [0.33, 0.66];
    return [0.5];
  };

  const traceHatch = (context, grid, fractions, a, b, d, e) => {
    context.beginPath();
    for (const fraction of fractions) {
      context.moveTo(grid.sx[a] + (grid.sx[e] - grid.sx[a]) * fraction, grid.sy[a] + (grid.sy[e] - grid.sy[a]) * fraction);
      context.lineTo(grid.sx[b] + (grid.sx[d] - grid.sx[b]) * fraction, grid.sy[b] + (grid.sy[d] - grid.sy[b]) * fraction);
    }
    context.stroke();
  };

  const inked = (alpha, bias) => Math.min(1, Math.max(0, alpha + bias));

  // Les faces se tracent dans l'ordre de profondeur (du fond vers l'avant) : `progress` en dessine la part voulue.
  const drawSurface = (context, grid, pixel, { inkBias, drawProgress }) => {
    context.lineJoin = 'round';
    context.lineCap = 'round';
    const drawn = Math.ceil(grid.order.length * drawProgress);
    for (let slot = 0; slot < drawn; slot++) {
      const quad = grid.order[slot];
      const i = Math.floor(quad / grid.nv);
      const j = quad - i * grid.nv;
      const a = vertexOf(grid, i, j);
      const b = vertexOf(grid, i + 1, j);
      const d = vertexOf(grid, i + 1, j + 1);
      const e = vertexOf(grid, i, j + 1);
      const shadow = grid.shadow[quad];
      context.beginPath();
      context.moveTo(grid.sx[a], grid.sy[a]);
      context.lineTo(grid.sx[b], grid.sy[b]);
      context.lineTo(grid.sx[d], grid.sy[d]);
      context.lineTo(grid.sx[e], grid.sy[e]);
      context.closePath();
      context.globalCompositeOperation = 'destination-out';
      context.globalAlpha = 1;
      context.fillStyle = '#000';
      context.fill();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = inked(0.02 + 0.34 * Math.pow(shadow, 1.25), inkBias);
      context.fillStyle = INK;
      context.fill();
      context.strokeStyle = INK;
      if (shadow > 0.62) {
        context.globalAlpha = inked(0.55, inkBias);
        context.lineWidth = pixel * 0.55;
        const fractions = hatchFractionsOf(shadow);
        traceHatch(context, grid, fractions, a, b, d, e);
      }
      context.globalAlpha = inked(0.18, inkBias);
      context.lineWidth = pixel * 0.4;
      context.stroke();
      const mask = grid.silhouette[quad];
      if (mask === 0) continue;
      context.globalAlpha = inked(0.9, inkBias);
      context.lineWidth = pixel * 1.1;
      traceEdges(context, grid, mask, a, b, d, e);
    }
    context.globalAlpha = 1;
  };

  const drawFamily = (context, instance, { phase, pose, mod }) => {
    const { identity, size } = instance;
    if (identity.family === 'chrome') {
      if (root.CockpitIdentityChrome) root.CockpitIdentityChrome.draw(context, identity, phase, pose, mod.inkBias);
      return;
    }
    drawSurface(context, surfaceOf(identity, phase, pose), VIRTUAL / size, mod);
  };

  let hasReportedDrawError = false;

  const reportDrawError = (identity, error) => {
    if (hasReportedDrawError) return;
    hasReportedDrawError = true;
    root.console.error(`identité ${identity.family} : dessin impossible`, error);
  };

  const phaseOf = (instance, mod) => (phases.get(instance.identity.key) || 0) + instance.trim + mod.phaseKick;

  const faceGapOf = instance => {
    const base = (phases.get(instance.identity.key) || 0) + instance.trim + instance.motion.phaseOffset;
    return Motion.faceGapOf(instance.identity.family, viewAnglesOf(instance.identity, base));
  };

  const modulationOf = (instance, now) => {
    if (prefersCalm()) return Motion.finalModulationOf(instance.motion.persistent);
    return Motion.motionAt(instance.motion, now, () => faceGapOf(instance));
  };

  const drawInstance = instance => {
    const { canvas, context, identity, size, mod } = instance;
    const ratio = root.devicePixelRatio || 1;
    const pixels = Math.round(size * ratio);
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    const scale = pixels / VIRTUAL;
    const phase = phaseOf(instance, mod);
    instance.drawnPhase = phase;
    instance.drawnMod = mod;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, pixels, pixels);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.save();
    context.beginPath();
    context.arc(CENTER, CENTER, identity.family === 'chrome' ? CLIP_RADIUS * mod.drawProgress : CLIP_RADIUS, 0, TAU);
    context.clip();
    try {
      drawFamily(context, instance, { phase, pose: { yaw: mod.yawOffset, tilt: mod.tiltOffset }, mod });
    } catch (error) {
      context.restore();
      reportDrawError(identity, error);
      return;
    }
    context.restore();
  };

  const hasMotionChanged = (mod, drawn) => drawn === null
    || ['inkBias', 'yawOffset', 'tiltOffset', 'drawProgress'].some(key => Math.abs(mod[key] - drawn[key]) > REDRAW_MOTION);

  const needsDraw = instance => Math.abs(phaseOf(instance, instance.mod) - instance.drawnPhase) > REDRAW_PHASE || hasMotionChanged(instance.mod, instance.drawnMod);

  const paces = new Map();

  const advancePhases = elapsedSeconds => {
    const seen = new Set();
    for (const instance of instances) {
      const { identity } = instance;
      if (seen.has(identity.key)) continue;
      seen.add(identity.key);
      const pace = speedOf(instance.state) * identity.tempo * identity.direction;
      paces.set(identity.key, pace);
      phases.set(identity.key, (phases.get(identity.key) || 0) + elapsedSeconds * pace);
    }
  };

  // Chaque instance garde sa propre avance (vitesse x facteur de réaction) par rapport à la phase partagée de son identité.
  const trimOf = (instance, elapsedSeconds, speedFactor) => {
    const { identity } = instance;
    const own = speedOf(instance.state) * speedFactor * identity.tempo * identity.direction;
    return elapsedSeconds * (own - (paces.get(identity.key) || 0));
  };

  const FRAME_SLACK_MS = 2;
  let isBoosted = false;

  // Retourne true quand l'instance réagit (elle a droit à la cadence haute).
  const tickInstance = (instance, now, elapsedSeconds) => {
    instance.motion = Motion.settle(instance.motion, now);
    const mod = modulationOf(instance, now);
    instance.trim += trimOf(instance, elapsedSeconds, mod.speedFactor);
    instance.mod = mod;
    if (!instance.isVisible || !instance.canvas.isConnected) return mod.isAnimating;
    const fps = mod.isAnimating ? Motion.REACT_FPS : FPS;
    if (now - instance.lastDrawAt < 1000 / fps - FRAME_SLACK_MS) return mod.isAnimating;
    if (!needsDraw(instance)) return mod.isAnimating;
    instance.lastDrawAt = now;
    drawInstance(instance);
    return mod.isAnimating;
  };

  const frame = now => {
    if (instances.length === 0 || isPaused || prefersCalm()) {
      isLooping = false;
      return;
    }
    root.requestAnimationFrame(frame);
    const tickFps = isBoosted ? Motion.REACT_FPS : FPS;
    if (now - lastFrameAt < 1000 / tickFps - FRAME_SLACK_MS) return;
    const elapsedSeconds = lastFrameAt === 0 ? 0 : Math.min(0.5, (now - lastFrameAt) / 1000);
    lastFrameAt = now;
    advancePhases(elapsedSeconds);
    isBoosted = false;
    for (const instance of instances) {
      if (tickInstance(instance, now, elapsedSeconds)) isBoosted = true;
    }
  };

  // En pause (île cachée), la boucle s'arrête : zéro image dessinée, zéro CPU.
  const pause = () => { isPaused = true; };

  const resume = () => {
    if (!isPaused) return;
    isPaused = false;
    startLoop();
  };

  const startLoop = () => {
    if (isLooping || isPaused || prefersCalm()) return;
    isLooping = true;
    lastFrameAt = 0;
    root.requestAnimationFrame(frame);
  };

  const createInstance = (key, size) => {
    const canvas = root.document.createElement('canvas');
    canvas.className = 'ident-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    const instance = {
      key, size, canvas, context, identity: null, state: 'rest', isVisible: true, drawnPhase: NaN, drawnMod: null,
      motion: Motion.createMotionState(), trim: 0, mod: { ...Motion.NEUTRAL }, lastDrawAt: 0, status: undefined, badgeEvent: null,
    };
    if (visibility) visibility.observe(canvas);
    return instance;
  };

  const forgetUnused = () => {
    const liveKeys = new Set(instances.map(instance => instance.identity.key));
    for (const store of [phases, surfaces, paces]) {
      for (const key of [...store.keys()]) {
        if (!liveKeys.has(key)) store.delete(key);
      }
    }
  };

  // La pastille d'état (badge) bouge avec la même modulation : saut à l'arrivée en « terminé », secousse en erreur.
  const playBadge = (instance, kind, elapsedMs) => {
    const badgeMotion = Motion.badgeMotionOf(kind);
    const face = instance.canvas.closest('.t-face');
    const badge = face ? face.querySelector('.ident-badge') : null;
    if (!badgeMotion || !badge || typeof badge.animate !== 'function' || elapsedMs >= badgeMotion.duration) return;
    badge.animate(badgeMotion.keyframes, { duration: badgeMotion.duration, delay: -elapsedMs, easing: 'linear' });
  };

  // Les têtes sont réécrites à chaque rendu : la réaction en cours de la pastille se poursuit sur le nouvel élément.
  const resumeBadge = instance => {
    if (instance.badgeEvent === null || prefersCalm()) return;
    playBadge(instance, instance.badgeEvent.kind, clock() - instance.badgeEvent.at);
  };

  const withReaction = (instance, reaction, now) => { instance.motion = Motion.startReaction(instance.motion, reaction, now); };

  // Le statut donne la réaction de fond de la tête ; elle ne change que quand le statut change.
  const syncStatus = (instance, status, now) => {
    if (status === undefined || status === instance.status) return;
    instance.status = status;
    withReaction(instance, Motion.kindOfStatus(status) || 'none', now);
  };

  const releaseHover = (instance, placeholder, now) => {
    const face = placeholder.closest('.mini-head') || placeholder.closest('.t-face');
    if (!face || !Motion.hasHover(instance.motion) || face.matches(':hover')) return;
    withReaction(instance, 'unhover', now);
  };

  const hydrate = (scope = root.document) => {
    const placeholders = [...scope.querySelectorAll('[data-ident]')];
    const free = instances.filter(instance => !instance.canvas.isConnected);
    const used = new Set(instances.filter(instance => instance.canvas.isConnected));
    const now = clock();
    for (const placeholder of placeholders) {
      const engineId = placeholder.dataset.ident;
      const size = Number(placeholder.dataset.identSize) || 48;
      const key = `${engineId}|${size}`;
      const reusable = free.find(instance => instance.key === key && !used.has(instance));
      const instance = reusable || createInstance(key, size);
      if (!reusable) instances.push(instance);
      used.add(instance);
      instance.identity = identityOf(engineId);
      instance.state = placeholder.dataset.identState || 'rest';
      syncStatus(instance, placeholder.dataset.identStatus, now);
      placeholder.replaceChildren(instance.canvas);
      releaseHover(instance, placeholder, now);
      instance.mod = modulationOf(instance, now);
      drawInstance(instance);
      resumeBadge(instance);
    }
    for (let index = instances.length - 1; index >= 0; index--) {
      const instance = instances[index];
      if (used.has(instance)) continue;
      if (visibility) visibility.unobserve(instance.canvas);
      instances.splice(index, 1);
    }
    forgetUnused();
    startLoop();
    return true;
  };

  const redrawNow = (targets, now) => {
    for (const instance of targets) {
      if (!instance.canvas.isConnected) continue;
      instance.mod = modulationOf(instance, now);
      instance.lastDrawAt = now;
      drawInstance(instance);
    }
  };

  const BADGE_KINDS = ['finish', 'error'];
  const STATIC_KINDS = Motion.PERSISTENT_KINDS;

  // Une réaction à des têtes : un événement, le survol, la pression. Mouvement réduit : seuls les états finaux comptent.
  const startOn = (targets, kind, options) => {
    const now = clock();
    const isCalm = prefersCalm();
    for (const instance of targets) {
      if (isCalm && !STATIC_KINDS.includes(kind)) continue;
      withReaction(instance, { kind, isEvent: kind === 'error' || undefined, ...options }, now);
      if (BADGE_KINDS.includes(kind) && !isCalm) {
        instance.badgeEvent = { kind, at: now };
        playBadge(instance, kind, 0);
      }
    }
    if (isCalm || kind === 'appear') redrawNow(targets, now);
    startLoop();
    return targets.length;
  };

  const targetsOf = (engineId, scope) => {
    const key = identityOf(engineId).key;
    return instances.filter(instance => instance.identity.key === key && (!scope || scope.contains(instance.canvas)));
  };

  // react(engineId, 'finish' | 'error' | 'wait' | 'permission' | 'blocked' | 'later' | 'press' | ...)
  const react = (engineId, kind, { scope = null, ...options } = {}) => startOn(targetsOf(engineId, scope), kind, options);

  const targetsIn = scope => instances.filter(instance => scope && scope.contains(instance.canvas));

  // Survol et pression : uniquement les têtes de la zone survolée.
  const hover = (scope, isOn) => startOn(targetsIn(scope), isOn ? 'hover' : 'unhover', {});
  const press = scope => startOn(targetsIn(scope), 'press', {});

  // Apparition de l'île : les volumes se tracent, décalés de 40 ms par tête dans l'ordre de l'écran.
  const appear = scope => {
    const canvases = [...scope.querySelectorAll('.ident-canvas')];
    canvases.forEach((canvas, index) => {
      const instance = instances.find(candidate => candidate.canvas === canvas);
      if (instance) startOn([instance], 'appear', { index });
    });
    return canvases.length;
  };

  if (calmQuery && typeof calmQuery.addEventListener === 'function') {
    calmQuery.addEventListener('change', () => {
      if (calmQuery.matches) redrawNow(instances, clock());
      else startLoop();
    });
  }

  root.CockpitIdentity = { ...api, hydrate, pause, resume, react, hover, press, appear };
})(typeof window !== 'undefined' ? window : globalThis);
