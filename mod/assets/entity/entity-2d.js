(function (root) {
  'use strict';

  // Six générateurs du moteur Encre et Papier (EncrePapier.engine) : guilloché, Lorenz, champ de flux, rubans, Voronoï,
  // harmonographe. Le trait est celui du générateur (lignes d'encre, pas de remplissage). Espace de travail 200 x 200.
  // Vie : phase (rotation, défilement, relaxation), échelle, épaisseur, inclinaison vers le curseur, onde et dérèglement.
  const C = root.CharacterCore;
  const EP = root.EncrePapier.engine;
  const TAU = Math.PI * 2;
  const { clamp } = C;
  const W = 200;
  const CX = 100;
  const REACH = 88;
  const FIT = 0.47;

  const blobAt = (S, theta) => 1 + 0.1 * Math.sin(3 * theta + S.r[5] * 6) + 0.07 * Math.sin(5 * theta + S.r[6] * 6);
  const inBlob = (S, x, y, k = 1) => { const dx = x - CX, dy = y - CX; return Math.hypot(dx, dy) < REACH * k * blobAt(S, Math.atan2(dy, dx)); };

  // Orientation vers le curseur : écrasement (tourne autour d'un axe) et roulis. Onde et dérèglement : déplacement de chaque point.
  const frame = (ctx, M, size) => {
    ctx.translate(50 + M.ox, 52 + M.oy); ctx.rotate(M.roll + M.yaw * 0.25);
    ctx.scale(Math.max(0.55, Math.cos(M.yaw)) * FIT * M.scale, Math.max(0.55, Math.cos(M.tilt)) * FIT * M.scale);
    ctx.translate(-CX, -CX);
  };

  const warpOf = M => {
    const needs = M.wave > 0.02 || M.chaos > 0.01;
    if (!needs) return null;
    const waveK = M.wave * 9, chaosK = M.chaos * 14, ph = M.phase, ms = M.waveMs / 1000;
    return (x, y) => {
      let dx = x - CX, dy = y - CX;
      const r = Math.hypot(dx, dy) || 1;
      const ripple = waveK * Math.sin(r * 0.1 - ms * 16) * Math.exp(-r / 150);
      const jx = chaosK * Math.sin(x * 0.19 + ph * 8) * Math.cos(y * 0.13 - ph * 6);
      const jy = chaosK * Math.cos(x * 0.15 - ph * 7) * Math.sin(y * 0.17 + ph * 9);
      return [x + (dx / r) * ripple + jx, y + (dy / r) * ripple + jy];
    };
  };

  const strokeLines = (ctx, lines, warp, S, M, env, step = 1) => {
    ctx.beginPath();
    for (const L of lines) {
      if (!L.length) continue;
      for (let j = 0; j < L.length; j += step) {
        const p = warp ? warp(L[j][0], L[j][1]) : L[j];
        if (j === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
    }
    ctx.stroke();
  };

  const setStroke = (ctx, S, M, env, weight) => {
    // épaisseur en pixels écran convertie dans l'espace de travail
    const px = (100 / env.size) / (FIT * M.scale);
    ctx.strokeStyle = S.ink;
    ctx.globalAlpha = clamp(M.alpha + (M.bloom || 0) * 0.2, 0.3, 1);
    ctx.lineWidth = Math.max(0.9, weight * (env.size < 30 ? 1.8 : env.size < 60 ? 1.25 : 1)) * M.lw * px * 0.9;
  };

  const rotateAbout = (ctx, a) => { ctx.translate(CX, CX); ctx.rotate(a); ctx.translate(-CX, -CX); };
  const countFor = (size, big, mid, small) => (size >= 60 ? big : size >= 30 ? mid : small);

  // ---- Guilloché : rosettes d'épitrochoïdes, chaque bande tourne à son rythme ----
  C.registerSystem('guilloche', (ctx, S, M, env) => {
    const bands = countFor(env.size, 8, 6, 3) + (env.size < 30 ? 0 : Math.floor(S.r[0] * 3));
    const key = `g${bands}`;
    const lines = S.cache[key] || (S.cache[key] = EP.guillocheLines({ w: W, h: W, bands, seed: S.key }));
    ctx.save(); frame(ctx, M, env.size);
    setStroke(ctx, S, M, env, 0.9); const warp = warpOf(M);
    lines.forEach((L, i) => {
      ctx.save(); rotateAbout(ctx, M.phase * 0.16 * (i % 2 ? 1 : -1) * (0.6 + 0.2 * i));
      ctx.beginPath();
      for (let j = 0; j < L.length; j += env.size < 30 ? 6 : 2) { const p = warp ? warp(L[j][0], L[j][1]) : L[j]; if (j === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
      ctx.stroke(); ctx.restore();
    });
    ctx.restore();
  });

  // ---- Lorenz : une seule ligne, vraie rotation 3D autour de l'axe, inclinaison vers le curseur ----
  C.registerSystem('lorenz', (ctx, S, M, env) => {
    const n = countFor(env.size, 2600, 1700, 900);
    const key = `l${n}`;
    let pts = S.cache[key];
    if (!pts) {
      const R = EP.rng(EP.seedOf(S.key)); const h = 0.005 * (9000 / n) * 0.55;
      let s = [1 + R() * 0.5, 1 + R() * 0.5, 1 + R() * 0.5]; pts = [];
      const f = q => [10 * (q[1] - q[0]), q[0] * (28 - q[2]) - q[1], q[0] * q[1] - (8 / 3) * q[2]];
      for (let i = 0; i < n + 400; i++) {
        const k1 = f(s), k2 = f(s.map((v, a) => v + h / 2 * k1[a])), k3 = f(s.map((v, a) => v + h / 2 * k2[a])), k4 = f(s.map((v, a) => v + h * k3[a]));
        s = s.map((v, a) => v + h / 6 * (k1[a] + 2 * k2[a] + 2 * k3[a] + k4[a]));
        if (i >= 400) pts.push([s[0], s[1], s[2] - 25]);
      }
      S.cache[key] = pts;
    }
    const rot = M.phase * 0.5 + S.r[1] * 6, c = Math.cos(rot), sn = Math.sin(rot), tl = -M.tilt * 1.4 + 0.25, ct = Math.cos(tl), st = Math.sin(tl);
    const out = [];
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of pts) {
      const px = p[0] * c + p[1] * sn, depth = -p[0] * sn + p[1] * c, py = p[2] * ct - depth * st;
      out.push([px, py]); if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
    }
    const k = Math.min(160 / (maxx - minx), 160 / (maxy - miny)), ox = (W - (maxx - minx) * k) / 2, oy = (W - (maxy - miny) * k) / 2;
    const line = out.map(p => [ox + (p[0] - minx) * k, oy + (p[1] - miny) * k]);
    ctx.save(); ctx.translate(50 + M.ox, 52 + M.oy); ctx.rotate(M.roll); ctx.scale(FIT * M.scale, FIT * M.scale); ctx.translate(-CX, -CX);
    setStroke(ctx, S, M, env, 0.85); const warp = warpOf(M);
    strokeLines(ctx, [line], warp, S, M, env, env.size < 30 ? 2 : 1);
    ctx.restore();
  });

  // ---- Champ de flux : lignes qui suivent un champ d'angles, dans une forme organique ; elles défilent au travail ----
  C.registerSystem('flow', (ctx, S, M, env) => {
    const sep = countFor(env.size, 5.6, 7.5, 17);
    const key = `f${sep}`;
    const lines = S.cache[key] || (S.cache[key] = EP.flowLines({ w: W, h: W, seed: S.key, count: 900, sep, step: 2, scale: 0.011, maxLen: 260, minPts: 6, warp: 1, mask: (x, y) => inBlob(S, x, y, 0.98) }));
    ctx.save(); frame(ctx, M, env.size); rotateAbout(ctx, M.phase * 0.05);
    setStroke(ctx, S, M, env, 1);
    const flowing = M.speed > 1.8 || M.chaos > 0.2;
    if (flowing) { ctx.setLineDash([22 * (200 / 100) * 0.4, 9]); ctx.lineDashOffset = -M.phase * 90; }
    strokeLines(ctx, lines, warpOf(M), S, M, env, 1);
    ctx.setLineDash([]); ctx.restore();
  });

  // ---- Rubans : fils tirés des bords, recalculés dans le temps du générateur (ils respirent) ----
  C.registerSystem('ribbons', (ctx, S, M, env) => {
    const count = countFor(env.size, 46, 30, 12);
    const time = 0.5 * Math.sin(M.phase * 0.35) + 0.2 * S.r[0];
    const RW = 200, off = (RW - W) / 2;
    const lines = EP.ribbonLines({ w: RW, h: RW, seed: S.key, count: count * 5, time, scale: 0.0026, maxLen: 120, step: 4 });
    const kept = [];
    for (const L of lines) {
      let run = [];
      for (const q of L) { const p = [q[0] - off, q[1] - off]; if (inBlob(S, p[0], p[1], 0.98)) run.push(p); else { if (run.length > 2) kept.push(run); run = []; } }
      if (run.length > 2) kept.push(run);
    }
    ctx.save(); frame(ctx, M, env.size); setStroke(ctx, S, M, env, 1);
    if (M.speed > 1.8 || M.chaos > 0.2) { ctx.setLineDash([26, 9]); ctx.lineDashOffset = -M.phase * 70; }
    strokeLines(ctx, kept, warpOf(M), S, M, env, 1);
    ctx.setLineDash([]); ctx.restore();
  });

  // ---- Voronoï : un amas de cellules qui se relaxent ; les graines s'attirent vers le curseur ----
  C.registerSystem('voronoi', (ctx, S, M, env) => {
    const n = countFor(env.size, 46, 30, 15);
    const key = `v${n}`;
    let seeds = S.cache[key];
    if (!seeds) {
      seeds = EP.voronoiSeeds(S.key, n * 2, W, W);
      for (let i = 0; i < 40; i++) EP.relax(seeds, W, W, 0.6);
      seeds = seeds.filter(p => inBlob(S, p[0], p[1], 0.92));
      S.cache[key] = seeds;
    }
    const t = M.phase, pts = seeds.map((p, i) => [p[0] + (4.5 * Math.sin(t * 0.8 + i * 1.7) + M.gx * 7 * (1 - Math.hypot(p[0] - CX, p[1] - CX) / 130)) , p[1] + 4.5 * Math.cos(t * 0.7 + i * 2.3) + M.gy * 6]);
    const cells = EP.voronoiCells(pts, W, W);
    const lines = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.length < 3) continue;
      const edgeFar = cell.some(q => !inBlob(S, q[0], q[1], 1.12));
      if (edgeFar) continue;
      lines.push(cell.concat([cell[0]]));
    }
    ctx.save(); frame(ctx, M, env.size); setStroke(ctx, S, M, env, 1.1);
    strokeLines(ctx, lines, warpOf(M), S, M, env, 1);
    ctx.restore();
  });

  // ---- Harmonographe : deux pendules amortis ; la courbe se resserre et dérive en phase ----
  C.registerSystem('harmonograph', (ctx, S, M, env) => {
    const ratios = [[2, 3], [3, 4], [3, 5], [4, 5], [5, 6]];
    const q = ratios[Math.floor(S.r[2] * ratios.length)], swap = S.r[3] < 0.5;
    const f = [q[0], q[1], q[swap ? 1 : 0] * 1.002, q[swap ? 0 : 1] * 0.998];
    const p = [S.r[4] * TAU, S.r[5] * TAU, S.r[6] * TAU, S.r[7] * TAU];
    const damp = 0.018 + 0.012 * S.r[0];
    const steps = countFor(env.size, 1700, 1100, 650), Tmax = 130, dT = Tmax / steps;
    const drift = M.phase * 0.35;
    const line = [];
    for (let i = 0; i <= steps; i++) {
      const T = i * dT, e0 = Math.exp(-damp * T), e1 = Math.exp(-damp * 1.1 * T);
      line.push([CX + REACH * (0.55 * Math.sin(f[0] * T * 0.5 + p[0] + drift) * e0 + 0.45 * Math.sin(f[1] * T * 0.5 + p[1]) * e1),
        CX + REACH * (0.55 * Math.sin(f[2] * T * 0.5 + p[2]) * e0 + 0.45 * Math.sin(f[3] * T * 0.5 + p[3] + drift * 0.5) * e1)]);
    }
    ctx.save(); frame(ctx, M, env.size); setStroke(ctx, S, M, env, 0.8);
    strokeLines(ctx, [line], warpOf(M), S, M, env, 1);
    ctx.restore();
  });
})(typeof window !== 'undefined' ? window : globalThis);
