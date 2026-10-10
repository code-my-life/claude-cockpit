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

  const viewOf = (phase, tilt, sway, scale, turn, yawStart) => {
    const yaw = yawStart + phase * turn;
    const pitch = tilt + sway * Math.sin(phase * 0.4);
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

  const fillSurface = (identity, grid, phase, scale) => {
    const { family, params } = identity;
    if (family === 'helix') {
      const view = viewOf(phase, params.tilt, 0.12, scale, 0.45, params.yaw);
      fillBand(grid, view, params.halfWidth, angle => (params.twists * (angle - Math.PI)) / 2, params.stretch);
    } else if (family === 'mobius') {
      const view = viewOf(phase, params.tilt, 0.16, scale, 0.6, params.yaw);
      fillBand(grid, view, params.halfWidth, angle => (params.twists * angle) / 2, params.stretch);
    } else {
      const view = viewOf(phase, 0.55, 0.08, scale, 0.28, params.yaw);
      fillLoft(grid, view, params, phase);
    }
  };

  const fitOf = (identity, grid) => {
    let farthest = 1e-6;
    for (let step = 0; step < FIT_SAMPLES; step++) {
      const phase = (FIT_SPANS[identity.family] * step) / FIT_SAMPLES;
      fillSurface(identity, grid, phase, 1);
      for (let index = 0; index < grid.sx.length; index++) {
        const reach = Math.hypot(grid.sx[index] - CENTER, grid.sy[index] - CENTER);
        farthest = Math.max(farthest, reach);
      }
    }
    return Math.min(FIT_MAX_SCALE, FIT_RADIUS / farthest);
  };

  const surfaceOf = (identity, phase) => {
    if (identity.family === 'chrome') return null;
    let grid = surfaces.get(identity.key);
    if (grid === undefined) {
      grid = buildGrid(identity);
      grid.fit = fitOf(identity, grid);
      surfaces.set(identity.key, grid);
    }
    fillSurface(identity, grid, phase, grid.fit);
    shadeGrid(grid);
    return grid;
  };

  const api = { FAMILIES, BACKGROUNDS, INK, PARAM_SPECS, SPEEDS, identityOf, tintOf, stateOf, speedOf, surfaceOf };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  const FPS = 15;
  const CLIP_RADIUS = 50;
  const CHROME_BLEED = 6;
  const REDRAW_PHASE = 0.02;
  const GL_SIZE = 112;
  const phases = new Map();
  const instances = [];
  let isLooping = false;
  let isPaused = false;
  let lastFrameAt = 0;
  const prefersCalm = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  const drawSurface = (context, grid, pixel) => {
    context.lineJoin = 'round';
    context.lineCap = 'round';
    for (let slot = 0; slot < grid.order.length; slot++) {
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
      context.globalAlpha = 0.02 + 0.34 * Math.pow(shadow, 1.25);
      context.fillStyle = INK;
      context.fill();
      context.strokeStyle = INK;
      if (shadow > 0.62) {
        context.globalAlpha = 0.55;
        context.lineWidth = pixel * 0.55;
        const fractions = hatchFractionsOf(shadow);
        traceHatch(context, grid, fractions, a, b, d, e);
      }
      context.globalAlpha = 0.18;
      context.lineWidth = pixel * 0.4;
      context.stroke();
      const mask = grid.silhouette[quad];
      if (mask === 0) continue;
      context.globalAlpha = 0.9;
      context.lineWidth = pixel * 1.1;
      traceEdges(context, grid, mask, a, b, d, e);
    }
    context.globalAlpha = 1;
  };

  const CHROME_FRAGMENT = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec2 uRes;uniform mat3 uM;uniform vec3 uS[6];uniform float uSr[6];uniform float uT;uniform float uBob;uniform vec3 uRing;',
    'float smin(float a,float b,float k){float h=max(k-abs(a-b),0.0)/k;return min(a,b)-h*h*k*0.25;}',
    'float ringD(vec3 l){vec3 q=vec3(l.x/uRing.z,l.y,l.z);float r=length(q.xz)-uRing.x;return (length(vec2(r,q.y))-uRing.y)*min(1.0,uRing.z);}',
    'float map(vec3 p){vec3 l=uM*p;float d=ringD(l);',
    ' for(int i=0;i<6;i++){float s=length(l-uS[i])-uSr[i];if(i<3){d=smin(d,s,0.14);}else{d=min(d,s);}}return d;}',
    'float bx(float x,float a,float b,float s){return smoothstep(a-s,a+s,x)*(1.0-smoothstep(b-s,b+s,x));}',
    'float room(vec3 d){float L;if(d.y>=0.0){float e=d.y/0.025;L=0.04+0.85*pow(smoothstep(0.0,1.0,d.y),1.4)+0.7*exp(-e*e);',
    ' float az=atan(d.z,d.x)-uT*0.12;L+=1.9*bx(az,0.3,1.2,0.07)*bx(d.y,0.22,0.85,0.1);L+=1.1*bx(az,-2.35,-2.1,0.04)*bx(d.y,0.05,1.0,0.1);',
    ' L+=0.9*bx(az,2.4,2.62,0.05)*bx(d.y,0.1,0.8,0.1);}else{L=0.1+0.62*smoothstep(0.0,0.7,-d.y);}return L;}',
    'void main(){vec2 fc=gl_FragCoord.xy;float u=fc.x/uRes.x*2.0-1.0;float v=(fc.y/uRes.y*2.0-1.0)*uRes.y/uRes.x;',
    ' vec3 rd=normalize(vec3(u*0.36,v*0.36,1.0));vec3 ro=vec3(0.0,-uBob,-5.0);',
    ' float b=dot(ro,rd);float cc=dot(ro,ro)-6.25;float disc=b*b-cc;',
    ' vec4 col=vec4(0.0);',
    ' if(disc>0.0){float t=-b-sqrt(disc);bool hit=false;vec3 p=ro;',
    '  for(int i=0;i<72;i++){p=ro+rd*t;float d=map(p);if(d<0.0015){hit=true;break;}t+=d*0.85;if(t>8.0)break;}',
    '  if(hit){float e=0.0015;vec3 n=normalize(vec3(1.,-1.,-1.)*map(p+vec3(e,-e,-e))+vec3(-1.,-1.,1.)*map(p+vec3(-e,-e,e))+vec3(-1.,1.,-1.)*map(p+vec3(-e,e,-e))+vec3(1.,1.,1.)*map(p+vec3(e,e,e)));',
    '   float dt=dot(rd,n);vec3 r=rd-2.0*dt*n;float L=room(r)*0.94;float fr=pow(1.0-abs(dt),4.0);L=clamp(L*(1.0-0.3*fr),0.0,1.0);',
    '   col=vec4(vec3(L*0.98,L*0.99,L*1.02),1.0);}}',
    ' gl_FragColor=col;}',
  ].join('\n');

  const multiplyMatrices = (left, right) => {
    const product = new Array(9);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        product[row * 3 + column] = left[row * 3] * right[column] + left[row * 3 + 1] * right[3 + column] + left[row * 3 + 2] * right[6 + column];
      }
    }
    return product;
  };

  const compileShader = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };

  let chromeGl;

  const createChromeGl = () => {
    const canvas = root.document.createElement('canvas');
    canvas.width = GL_SIZE;
    canvas.height = GL_SIZE;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}');
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, CHROME_FRAGMENT);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniform = name => gl.getUniformLocation(program, name);
    gl.viewport(0, 0, GL_SIZE, GL_SIZE);
    gl.uniform2f(uniform('uRes'), GL_SIZE, GL_SIZE);
    const locations = { matrix: uniform('uM'), spheres: uniform('uS[0]'), radii: uniform('uSr[0]'), time: uniform('uT'), bob: uniform('uBob'), ring: uniform('uRing') };
    return { canvas, gl, locations, spheres: new Float32Array(18), radii: new Float32Array(6) };
  };

  const chromeOf = () => {
    if (chromeGl === undefined) chromeGl = createChromeGl();
    return chromeGl;
  };

  const fraction = value => value - Math.floor(value);

  const renderChrome = (identity, phase) => {
    const shared = chromeOf();
    if (!shared || shared.gl.isContextLost()) return null;
    const { gl, locations, spheres, radii } = shared;
    const { ringRadius, thickness, stretch, tilt, roll, dropCount, dropSize, dropSeed, yaw } = identity.params;
    const t = phase * 0.9;
    const ax = tilt + 0.22 * Math.sin(t * 0.33);
    const ay = yaw + t * 0.2;
    const az = roll + 0.2 * Math.sin(t * 0.21);
    const turnX = [1, 0, 0, 0, Math.cos(ax), -Math.sin(ax), 0, Math.sin(ax), Math.cos(ax)];
    const turnY = [Math.cos(ay), 0, Math.sin(ay), 0, 1, 0, -Math.sin(ay), 0, Math.cos(ay)];
    const turnZ = [Math.cos(az), -Math.sin(az), 0, Math.sin(az), Math.cos(az), 0, 0, 0, 1];
    const turnXY = multiplyMatrices(turnX, turnY);
    const matrix = multiplyMatrices(turnZ, turnXY);
    gl.uniformMatrix3fv(locations.matrix, false, new Float32Array(matrix));
    const scale = ringRadius / 1.05;
    const shift = dropSeed * Math.PI * 2;
    const baseAngles = [0.85, 3.55, 5.3];
    const baseHeights = [0.02, -0.04, 0.06];
    const baseRadii = [0.44, 0.4, 0.34, 0.3, 0.17, 0.1];
    const centres = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [(0.05 + 0.25 * Math.sin(t * 0.7)) * scale, 0.12 + 0.15 * Math.sin(t * 0.9), (0.05 + 0.25 * Math.cos(t * 0.6)) * scale],
      [(0.15 + 0.45 * Math.sin(t * 0.5)) * scale, 1.02 + 0.15 * Math.sin(t * 0.8), (0.3 + 0.35 * Math.cos(t * 0.5)) * scale],
      [(-0.72 + 0.15 * Math.sin(t * 0.6)) * scale, -0.95 + 0.1 * Math.cos(t * 0.7), (0.2 + 0.2 * Math.sin(t * 0.4)) * scale],
    ];
    for (let index = 0; index < 3; index++) {
      const angle = baseAngles[index] + shift + t * (0.28 + 0.09 * index);
      centres[index] = [ringRadius * stretch * Math.cos(angle), baseHeights[index] + 0.05 * Math.sin(t + index), ringRadius * Math.sin(angle)];
    }
    for (let index = 0; index < 6; index++) {
      const isActive = index < dropCount;
      const variation = 0.7 + 0.6 * fraction(Math.sin((index + 1) * 12.9898 + dropSeed * 78.233) * 43758.5453);
      const breathing = 1 + 0.15 * Math.sin(t * 0.9 + index * 2.1);
      const centre = isActive ? centres[index] : [0, 0, 9];
      spheres[index * 3] = centre[0];
      spheres[index * 3 + 1] = centre[1];
      spheres[index * 3 + 2] = centre[2];
      radii[index] = isActive ? baseRadii[index] * (dropSize / 0.35) * variation * breathing : 0.001;
    }
    gl.uniform3fv(locations.spheres, spheres);
    gl.uniform1fv(locations.radii, radii);
    gl.uniform1f(locations.time, t);
    gl.uniform1f(locations.bob, 0.07 * Math.sin(t * 0.8));
    gl.uniform3f(locations.ring, ringRadius, thickness, stretch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return shared.canvas;
  };

  const drawChrome = (context, identity, phase) => {
    const source = renderChrome(identity, phase);
    if (source === null) return;
    context.imageSmoothingEnabled = true;
    context.drawImage(source, -CHROME_BLEED, -CHROME_BLEED, VIRTUAL + 2 * CHROME_BLEED, VIRTUAL + 2 * CHROME_BLEED);
  };

  const drawFamily = (context, instance, phase) => {
    const { identity, size } = instance;
    if (identity.family === 'chrome') {
      drawChrome(context, identity, phase);
      return;
    }
    const grid = surfaceOf(identity, phase);
    drawSurface(context, grid, VIRTUAL / size);
  };

  let hasReportedDrawError = false;

  const reportDrawError = (identity, error) => {
    if (hasReportedDrawError) return;
    hasReportedDrawError = true;
    root.console.error(`identité ${identity.family} : dessin impossible`, error);
  };

  const drawInstance = instance => {
    const { canvas, context, identity, size } = instance;
    const ratio = root.devicePixelRatio || 1;
    const pixels = Math.round(size * ratio);
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    const scale = pixels / VIRTUAL;
    const phase = phases.get(identity.key) || 0;
    instance.drawnPhase = phase;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, pixels, pixels);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.save();
    context.beginPath();
    context.arc(CENTER, CENTER, CLIP_RADIUS, 0, TAU);
    context.clip();
    try {
      drawFamily(context, instance, phase);
    } catch (error) {
      context.restore();
      reportDrawError(identity, error);
      return;
    }
    context.restore();
  };

  const needsDraw = instance => {
    const phase = phases.get(instance.identity.key) || 0;
    return Math.abs(phase - instance.drawnPhase) > REDRAW_PHASE;
  };

  const advancePhases = elapsedSeconds => {
    const seen = new Set();
    for (const instance of instances) {
      const { identity } = instance;
      if (seen.has(identity.key)) continue;
      seen.add(identity.key);
      const step = elapsedSeconds * speedOf(instance.state) * identity.tempo * identity.direction;
      const current = phases.get(identity.key) || 0;
      phases.set(identity.key, current + step);
    }
  };

  const frame = now => {
    if (instances.length === 0 || isPaused) {
      isLooping = false;
      return;
    }
    root.requestAnimationFrame(frame);
    if (now - lastFrameAt < 1000 / FPS) return;
    const elapsedSeconds = lastFrameAt === 0 ? 0 : Math.min(0.5, (now - lastFrameAt) / 1000);
    lastFrameAt = now;
    advancePhases(elapsedSeconds);
    for (const instance of instances) {
      if (instance.isVisible && instance.canvas.isConnected && needsDraw(instance)) drawInstance(instance);
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
    const instance = { key, size, canvas, context, identity: null, state: 'rest', isVisible: true, drawnPhase: NaN };
    if (visibility) visibility.observe(canvas);
    return instance;
  };

  const forgetUnused = () => {
    const liveKeys = new Set(instances.map(instance => instance.identity.key));
    for (const store of [phases, surfaces]) {
      for (const key of [...store.keys()]) {
        if (!liveKeys.has(key)) store.delete(key);
      }
    }
  };

  const hydrate = (scope = root.document) => {
    const placeholders = [...scope.querySelectorAll('[data-ident]')];
    const free = instances.filter(instance => !instance.canvas.isConnected);
    const used = new Set(instances.filter(instance => instance.canvas.isConnected));
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
      placeholder.replaceChildren(instance.canvas);
      drawInstance(instance);
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

  root.CockpitIdentity = { ...api, hydrate, pause, resume };
})(typeof window !== 'undefined' ? window : globalThis);
