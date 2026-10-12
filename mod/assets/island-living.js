(function (root) {
  'use strict';

  // Les entités vivantes de l'île : la grande (une seule, qui voyage d'une vue à l'autre) et les petites (une par pastille).
  // Cadences : la grande à 30 images/s ouverte ; réduite elle est petite et peu regardée (le chrome, rendu WebGL, coûte au GPU) ;
  // les petites ne s'animent que le temps d'une réaction (état, survol, clic).
  const HERO_PX = 96;
  const HERO_COMPACT_PX = 32;
  const HERO_FPS_OPEN = 30;
  const HERO_FPS_COMPACT = 15;
  const SMALL_FPS = 20;
  const MOUNT_SELECTOR = '.is-head, button, a';

  const createLiving = ctx => {
    const { S, model, entities, helpers, $, $$, islandEl, heroEl } = ctx;
    const mounts = new Map();
    let hero = null;
    let heroPx = HERO_COMPACT_PX;

    const mountIn = scope => {
      for (const canvas of $$('canvas[data-ent]', scope)) {
        const row = ctx.rowOf(canvas.dataset.ent);
        if (!row || mounts.has(canvas)) continue;
        const options = { seed: row.engineId, size: Number(canvas.dataset.size), state: model.entityStateOf(row), hoverTarget: canvas.closest(MOUNT_SELECTOR) || canvas, still: true, fps: SMALL_FPS };
        mounts.set(canvas, entities.mount(canvas, options));
      }
    };

    const unmountIn = scope => {
      for (const [canvas, mount] of [...mounts]) {
        if (scope && !scope.contains(canvas)) continue;
        mount.destroy();
        mounts.delete(canvas);
      }
    };

    const sizeHeroBox = () => { heroEl.style.width = `${heroPx}px`; heroEl.style.height = `${heroPx}px`; };

    const heroOf = row => {
      if (!hero) hero = entities.mount($('#heroCanvas'), { seed: row.engineId, size: heroPx, state: model.entityStateOf(row), fps: HERO_FPS_COMPACT });
      sizeHeroBox();
      return hero;
    };

    // L'entité de la vue courante (ouverte) ou de la conversation la plus urgente (réduite), et la teinte de verre qui va avec.
    const syncHero = () => {
      const row = S.phase === 'open' ? ctx.views.heroRowFor(S.view) : ctx.urgent();
      if (!row) return;
      islandEl.dataset.conv = row.engineId;
      // En cartes : l'île garde le verre du cockpit, sans teinte ni grande entité (la carte porte l'identité).
      if (ctx.cards) { islandEl.style.setProperty('--conv-tint', 'var(--paper)'); return; }
      const mount = heroOf(row);
      mount.setSeed(row.engineId);
      mount.setState(model.entityStateOf(row));
      islandEl.style.setProperty('--conv-tint', helpers.tintOf(row.engineId) || 'var(--paper)');
    };

    // La grande entité change de taille de dessin (32 réduite, 96 ouverte) sans que son aspect bouge : l'échelle suit.
    const rebaseHero = px => {
      if (px === heroPx) return;
      if (!hero) { heroPx = px; return; }
      ctx.motion.rescaleHero(heroPx / px);
      heroPx = px;
      hero.setSize(px);
      hero.setFps(px === HERO_PX ? HERO_FPS_OPEN : HERO_FPS_COMPACT);
      sizeHeroBox();
      ctx.motion.redraw();
    };

    // Seules les entités des couches visibles tournent.
    const visibleLayers = () => {
      const target = S.phase === 'open' ? S.view : (S.phase === 'compact' ? 'compact' : null);
      return ctx.LAYERS.filter(name => name === target || ctx.motion.opacityOf(name) > 0.02);
    };
    const mountVisible = () => { for (const name of visibleLayers()) mountIn(ctx.layerEl(name)); };
    const unmountHidden = () => { for (const name of ctx.LAYERS) if (!visibleLayers().includes(name)) unmountIn(ctx.layerEl(name)); };

    // Réactions de la grande entité : survol et clic sur sa place.
    const wirePointer = () => {
      const onSlot = (event, run) => { if (hero && event.target.closest('[data-slot]')) run(); };
      islandEl.addEventListener('pointerover', event => onSlot(event, () => hero.hover(true)));
      islandEl.addEventListener('pointerout', event => onSlot(event, () => hero.hover(false)));
      islandEl.addEventListener('pointerdown', event => onSlot(event, () => hero.press()));
    };

    return {
      mountIn, unmountIn, mountVisible, unmountHidden, syncHero, rebaseHero, wirePointer,
      heroPx: () => heroPx, dispose: () => { unmountIn(null); if (hero) hero.destroy(); },
    };
  };

  const api = { createLiving, HERO_PX, HERO_COMPACT_PX };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandLiving = api;
})(typeof window !== 'undefined' ? window : globalThis);
