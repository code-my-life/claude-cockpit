(function (root) {
  'use strict';

  // v2 : l'entité EST le système. Aucun trait de mascotte. La graine choisit le système (les 4 familles de identity.js
  // et 6 générateurs du moteur Encre et Papier), ses paramètres et sa teinte ; la vie passe par les paramètres du système
  // (phase, échelle, épaisseur du trait, orientation, onde, dérèglement, fracture). Tout est piloté par l'état.
  const TAU = Math.PI * 2;
  const SYSTEMS = ['chrome', 'helix', 'loft', 'mobius', 'guilloche', 'lorenz', 'flow', 'ribbons', 'voronoi', 'harmonograph'];
  const SYSTEM_LABELS = { chrome: 'Chrome', helix: 'Hélice', loft: 'Loft', mobius: 'Möbius', guilloche: 'Guilloché', lorenz: 'Lorenz', flow: 'Champ de flux', ribbons: 'Rubans', voronoi: 'Voronoï', harmonograph: 'Harmonographe' };
  const STATES = ['idle', 'working', 'waiting', 'permission', 'done', 'error', 'sleep'];
  const STATE_LABELS = { idle: 'Repos', working: 'Travaille', waiting: 'Attend', permission: 'Permission', done: 'Terminé', error: 'Erreur', sleep: 'Endormie' };
  const STATUS_TO_STATE = { thinking: 'working', writing: 'working', tool: 'working', working: 'working', permission: 'permission', external: 'waiting', done: 'done', error: 'error', blocked: 'error', later: 'sleep' };
  const FORMS = new Set(['chrome', 'helix', 'loft', 'mobius']);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const mulberry = seed => {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let m = Math.imul(s ^ (s >>> 15), 1 | s);
      m = (m + Math.imul(m ^ (m >>> 7), 61 | m)) ^ m;
      return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hslOfHex = hex => {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; }
    return (h * 60 + 360) % 360;
  };
  const hsl = (h, s, l, a = 1) => `hsla(${Math.round(h)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${a})`;

  // ---------- Graine : système, identité de ce système, palette ----------
  const subjects = new Map();
  const identityFor = (key, family) => {
    const base = root.CockpitIdentity.identityOf(key);
    if (base.family === family) return base;
    // famille imposée : mêmes bornes de paramètres que identity.js, tirage propre à la graine
    const random = mulberry(base.seed ^ 0x51ed270b);
    const params = {};
    for (const [name, spec] of Object.entries(root.CockpitIdentity.PARAM_SPECS[family])) {
      if (spec.choices) { params[name] = spec.choices[Math.floor(random() * spec.choices.length)]; continue; }
      const value = spec.min + random() * (spec.max - spec.min);
      params[name] = spec.isInteger ? Math.min(spec.max, Math.floor(value)) : value;
    }
    return { ...base, key: `${base.key}|${family}`, family, params };
  };

  const subjectOf = seed => {
    const key = String(seed ?? '').trim() || 'sans-identifiant';
    if (subjects.has(key)) return subjects.get(key);
    const base = root.CockpitIdentity.identityOf(key);
    const system = SYSTEMS[(base.seed >>> 3) % SYSTEMS.length];
    const hue = hslOfHex(base.background);
    const identity = FORMS.has(system) ? identityFor(key, system) : base;
    const r = mulberry(base.seed ^ 0x2f6e2b1);
    const subject = {
      key, system, identity, hue, tempo: base.tempo, spin: base.direction,
      ink: hsl(hue, 0.55, 0.74), inkSoft: hsl(hue, 0.5, 0.64), inkRaw: [hue],
      r: [r(), r(), r(), r(), r(), r(), r(), r()],
      cache: {},
    };
    subjects.set(key, subject);
    return subject;
  };

  // ---------- Modulation : l'état et les gestes deviennent des paramètres du système ----------
  const hop = (ms, height) => (ms >= 0 && ms < 280 ? height * Math.sin(Math.PI * Math.pow(ms / 280, 0.8)) : 0);
  const kickOf = ms => 0.6 * easeOut(ms / 280);
  const spring = ms => Math.exp(-ms / 70) * Math.cos(ms / 38);

  const BASE = {
    idle: { speed: 1, breath: 0.022, period: 4.6, lw: 1, alpha: 1, lean: 1, sway: 1 },
    working: { speed: 2.9, breath: 0.014, period: 1.3, lw: 1.12, alpha: 1, lean: 0.35, sway: 0.4 },
    waiting: { speed: 1.1, breath: 0.04, period: 1.7, lw: 1.05, alpha: 1, lean: 2, sway: 0.6 },
    permission: { speed: 0.9, breath: 0.01, period: 2.4, lw: 1.3, alpha: 1, lean: 1.2, sway: 0.2 },
    done: { speed: 0.8, breath: 0.02, period: 4.2, lw: 1.05, alpha: 1, lean: 0.8, sway: 0.7 },
    error: { speed: 0, breath: 0, period: 4, lw: 1.05, alpha: 0.92, lean: 0, sway: 0 },
    sleep: { speed: 0.12, breath: 0.035, period: 6.5, lw: 0.75, alpha: 0.62, lean: 0, sway: 0.15 },
  };

  const modOf = (S, state, o) => {
    const b = BASE[state] || BASE.idle;
    const live = !o.reduced;
    const t = live ? o.t : 0;
    const sec = t / 1000;
    const M = {
      speed: b.speed, scale: 1, lw: b.lw, alpha: b.alpha, yaw: 0, tilt: 0, roll: 0, ox: 0, oy: 0, inkBias: 0,
      wave: 0, waveMs: 0, chaos: 0, fracture: 0, glyph: null, face: 0, lean: b.lean, sway: b.sway,
    };
    // respiration : amplitude de l'échelle, rythme de l'état
    M.scale *= 1 + (live ? b.breath * Math.sin(sec * TAU / b.period) : 0);
    // regard : le système s'incline vers le curseur ; sans curseur, il flâne
    const g = o.gaze;
    let gx = 0, gy = 0;
    if (live && g) { const d = Math.hypot(g.dx, g.dy); gx = (g.dx / (d + 60)); gy = (g.dy / (d + 60)); }
    else if (live) { gx = Math.sin(sec * 0.37 + S.r[0] * 6) * 0.3; gy = Math.sin(sec * 0.29 + S.r[1] * 6) * 0.2; }
    M.yaw = gx * 0.55 * b.lean + (live ? Math.sin(sec * 0.41 + S.r[2] * 6) * 0.16 * b.sway : 0);
    M.tilt = gy * 0.35 * b.lean + (live ? Math.sin(sec * 0.33 + S.r[3] * 6) * 0.09 * b.sway : 0);
    M.gx = gx; M.gy = gy;
    const since = Number.isFinite(o.since) ? o.since : 99999;

    if (state === 'working') { M.oy += live ? Math.sin(sec * 11) * 0.35 : 0; M.glyph = 'dots'; }
    else if (state === 'waiting') {
      M.scale *= live ? 1 + 0.025 * Math.pow(Math.max(0, Math.sin(sec * TAU / 1.7)), 3) : 1.03;
      if (live) { M.oy -= hop(t % 6000, 4.5); }
      M.roll = 0.07;
      M.kick = live ? kickOf(t % 6000) * (t % 6000 < 280 ? 1 : 0) : 0;
    } else if (state === 'permission') {
      const gate = live ? Math.max(0, Math.sin(sec * TAU / 2.4)) : 0;
      M.speed = 0.08 + 1.5 * gate * gate;
      M.scale *= 0.94; M.alpha = 1; M.inkBias = 0.08; M.glyph = 'ask';
      if (live) { M.ox += Math.sin(sec * 43) * 0.35; M.oy -= hop(t % 3000, 3); }
      M.roll = -0.05;
    } else if (state === 'done') {
      M.glyph = 'check';
      if (live) {
        M.scale *= 1 + 0.2 * Math.exp(-since / 230) * Math.cos(since / 120) + 0.0;
        M.speed += 3.5 * Math.exp(-since / 450);
        M.yaw += 1.1 * Math.sin(Math.PI * clamp(since / 900, 0, 1));
        M.oy -= hop(since, 6);
        M.lw *= 1 + 0.4 * Math.exp(-since / 500);
      } else { M.scale *= 1.06; M.lw *= 1.15; }
      M.bloom = live ? Math.exp(-since / 500) : 0.4;
    } else if (state === 'error') {
      M.fracture = 1; M.glyph = 'bang'; M.roll = -0.1;
      if (live) { M.ox += (since < 300 ? 2 * Math.sin(TAU * since / 150) : 0) + Math.sin(sec * 53) * 0.35; M.chaos = 0.18 + 0.1 * Math.sin(sec * 7); }
      else M.chaos = 0.2;
    } else if (state === 'sleep') { M.glyph = 'zzz'; M.oy += 1.5; }

    // survol : il se resserre, s'éclaire, se tourne vers toi
    const h = clamp(o.hover || 0, 0, 1);
    if (live && h > 0) {
      M.scale *= 1 - 0.05 * h; M.lw *= 1 + 0.3 * h; M.inkBias += 0.1 * h; M.alpha = Math.min(1, M.alpha + 0.35 * h);
      M.face = h; M.speed *= 1 + 0.5 * h; M.sway *= 1 - 0.8 * h;
      if (state === 'sleep') { M.lw = lerp(M.lw, 0.9, h); M.speed = lerp(M.speed, 0.6, h); }
    }
    // clic : compression puis rebond, onde dans le trait ; clic répété : il s'emballe, se dérègle, se remet
    const p = o.press;
    if (live && p && Number.isFinite(p.since)) {
      const ms = p.since;
      if (ms < 320) { const s = spring(ms); M.scale *= 1 - 0.15 * s; M.oy -= 2.5 * (1 - s) * Math.exp(-ms / 110); }
      M.wave = Math.exp(-ms / 450); M.waveMs = ms;
      if (p.count === 2) M.speed *= 1 + 2.2 * Math.exp(-ms / 900);
      if (p.count >= 3) {
        const calm = Math.exp(-ms / 1100);
        M.speed *= 1 + 7 * calm; M.chaos = Math.max(M.chaos, 0.55 * calm); M.roll += 0.12 * Math.sin(ms / 60) * calm;
        M.lw *= 1 + 0.3 * calm;
      }
    }
    return M;
  };

  // ---------- Phase : l'intégrale de la vitesse, tenue par canvas ----------
  const phaseOf = (canvas, S, M, o) => {
    if (o.reduced) return 3 + S.r[4] * 5;
    if (Number.isFinite(o.phase)) return o.phase;
    const store = canvas.__ch || (canvas.__ch = { phase: S.r[4] * 20, lastT: null, key: S.key });
    const dt = store.lastT === null ? 0 : clamp(o.t - store.lastT, 0, 100) / 1000;
    store.lastT = o.t;
    store.phase += dt * M.speed * S.tempo * S.spin * 0.6;
    return store.phase;
  };

  const systems = {};
  const registerSystem = (id, draw) => { systems[id] = draw; };

  // ---------- Glyphes d'état dans le même trait que le système ----------
  const glyphOf = (ctx, S, M, env, t) => {
    const g = M.glyph;
    if (!g) return;
    const k = clamp(30 / env.size, 1, 1.6) * (env.size < 30 ? 1 : 0.95);
    ctx.save();
    ctx.translate(82, 14); ctx.scale(k, k);
    ctx.strokeStyle = S.ink; ctx.fillStyle = S.ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.1 * (env.size < 30 ? 1.2 : 1);
    const live = !env.reduced;
    if (g === 'dots') {
      for (let i = 0; i < 3; i++) { const w = live ? Math.max(0, Math.sin(t / 190 - i * 0.9)) : 0.4; ctx.beginPath(); ctx.arc((i - 1) * 6.2, -2 * w, 1.6 + 0.9 * w, 0, TAU); ctx.fill(); }
    } else if (g === 'ask') {
      ctx.beginPath(); ctx.arc(0, -2, 5.2, Math.PI * 1.05, Math.PI * 2.5); ctx.lineTo(0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 12.5, 1.4, 0, TAU); ctx.fill();
    } else if (g === 'check') {
      ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(-2, 6.5); ctx.lineTo(8, -6); ctx.stroke();
    } else if (g === 'bang') {
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 11.5, 1.4, 0, TAU); ctx.fill();
    } else if (g === 'zzz') {
      const cycle = live ? (t % 3800) / 3800 : 0.3;
      for (let i = 0; i < 2; i++) {
        const q = (cycle + i * 0.5) % 1, s = 3 + 2.4 * q;
        ctx.save(); ctx.translate(-4 + i * 5 + q * 3, 6 - q * 15); ctx.globalAlpha = live ? Math.sin(Math.PI * q) : 0.9;
        ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, -s); ctx.lineTo(-s, s); ctx.lineTo(s, s); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  };

  // ---------- Point d'entrée ----------
  const renderCharacter = (seed, size, state, opts = {}) => {
    const o = { t: 0, gaze: null, hover: 0, press: null, since: Infinity, prev: null, reduced: false, dpr: root.devicePixelRatio || 1, ...opts };
    const canvas = o.canvas;
    const px = Math.round(size * o.dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    const S = subjectOf(seed);
    const M = modOf(S, state, o);
    M.phase = phaseOf(canvas, S, M, o);
    if (M.kick) M.phase += M.kick;
    const env = { size, reduced: o.reduced, t: o.t, since: o.since, unit: 100 / size, dpr: o.dpr, px };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.setTransform(px / 100, 0, 0, px / 100, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const draw = systems[S.system];
    if (M.fracture > 0) {
      // erreur : le système se fracture en bandes désalignées
      const off = canvas.__off || (canvas.__off = document.createElement('canvas'));
      if (off.width !== px) { off.width = px; off.height = px; }
      const octx = off.getContext('2d');
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, px, px); octx.setTransform(px / 100, 0, 0, px / 100, 0, 0);
      octx.lineCap = 'round'; octx.lineJoin = 'round';
      draw(octx, S, M, env);
      const bands = [[0, 30, -5], [30, 56, 3.6], [56, 78, -2.2], [78, 100, 5]];
      const jitter = o.reduced ? 0 : Math.sin(o.t / 70) * 0.4;
      ctx.save();
      for (const [y0, y1, dx] of bands) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, 100, y1 - y0); ctx.clip();
        ctx.setTransform(1, 0, 0, 1, (dx + jitter) * px / 100, 0);
        ctx.drawImage(off, 0, 0);
        ctx.restore();
      }
      ctx.restore();
      ctx.setTransform(px / 100, 0, 0, px / 100, 0, 0);
    } else draw(ctx, S, M, env);
    glyphOf(ctx, S, M, env, o.t);
    return { system: S.system, hue: S.hue };
  };

  root.CharacterCore = {
    SYSTEMS, SYSTEM_LABELS, STATES, STATE_LABELS, STATUS_TO_STATE, TAU, clamp, lerp, mulberry, hsl,
    subjectOf, registerSystem, renderCharacter,
  };
  root.renderCharacter = renderCharacter;
})(typeof window !== 'undefined' ? window : globalThis);
