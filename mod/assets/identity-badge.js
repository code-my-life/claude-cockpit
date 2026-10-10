(function (root) {
  'use strict';

  // La pastille d'état (badge) d'une tête bouge avec la même modulation que le volume :
  // saut à l'arrivée en « terminé », secousse en erreur. Côté page seulement ; le mouvement vient de identity-motion.js.
  const badgeOf = canvas => {
    const face = canvas.closest('.t-face');
    return face ? face.querySelector('.ident-badge') : null;
  };

  // `elapsedMs` : la part déjà écoulée, quand la tête a été réécrite en cours de route.
  const play = (canvas, kind, elapsedMs) => {
    const motion = root.CockpitIdentityMotion.badgeMotionOf(kind);
    const badge = badgeOf(canvas);
    if (!motion || !badge || typeof badge.animate !== 'function' || elapsedMs >= motion.duration) return;
    badge.animate(motion.keyframes, { duration: motion.duration, delay: -elapsedMs, easing: 'linear' });
  };

  // Le mouvement réduit coupe aussi la pastille en cours de saut ou de secousse.
  const stop = canvases => {
    for (const canvas of canvases) {
      const badge = badgeOf(canvas);
      if (badge && typeof badge.getAnimations === 'function') badge.getAnimations().forEach(animation => animation.cancel());
    }
  };

  root.CockpitIdentityBadge = { play, stop };
})(typeof window !== 'undefined' ? window : globalThis);
