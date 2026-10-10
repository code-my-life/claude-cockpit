(function (root) {
  'use strict';

  // Les 4 familles de identity.js, dessinées par SON code (surfaceOf, drawSurface, rendu WebGL du chrome),
  // sans disque de fond : l'encre prend la teinte de la graine, comme le disque la donnait.
  const C = root.CharacterCore;
  const I = root.CockpitIdentityInternals;
  const Id = root.CockpitIdentity;
  const Motion = root.CockpitIdentityMotion;
  const { clamp } = C;
  const FIT = 1.0;

  const poseOf = (S, M) => {
    const id = S.identity;
    let yaw = M.yaw, tilt = M.tilt;
    if (M.face > 0) {
      const angles = Id.viewAnglesOf(id, M.phase);
      const gap = Motion.faceGapOf(id.family, { yaw: angles.yaw, tilt: angles.tilt });
      yaw += gap.yawGap * M.face; tilt += gap.tiltGap * M.face;
    }
    if (M.chaos > 0) { yaw += (Math.random() - 0.5) * M.chaos * 1.6; tilt += (Math.random() - 0.5) * M.chaos; }
    return { yaw, tilt };
  };

  const place = (ctx, M) => {
    ctx.translate(50 + M.ox, 52 + M.oy); ctx.rotate(M.roll); ctx.scale(FIT * M.scale, FIT * M.scale); ctx.translate(-50, -50);
  };

  const drawForm = (ctx, S, M, env) => {
    const id = S.identity;
    ctx.save();
    place(ctx, M);
    const pose = poseOf(S, M);
    const bias = clamp(M.inkBias + (M.alpha - 1) * 0.3 + (M.bloom || 0) * 0.15, -0.5, 0.5);
    if (id.family === 'chrome') {
      ctx.globalAlpha = clamp(M.alpha + (M.face || 0) * 0.1, 0.3, 1);
      if (!S.chromeTint) S.chromeTint = C.hsl(S.hue, 0.72, 0.7);
      if (root.CockpitIdentityChrome) root.CockpitIdentityChrome.draw(ctx, id, M.phase, pose, 0, { pixels: env.px * FIT * M.scale, tint: S.chromeTint });
    } else {
      I.setInk(S.ink);
      const grid = I.surfaceOf(id, M.phase, pose);
      I.drawSurface(ctx, grid, (100 / env.size) * M.lw / (FIT * M.scale), { inkBias: bias, drawProgress: 1 });
    }
    ctx.restore();
  };

  for (const f of ['chrome', 'helix', 'loft', 'mobius']) C.registerSystem(f, drawForm);
})(typeof window !== 'undefined' ? window : globalThis);
