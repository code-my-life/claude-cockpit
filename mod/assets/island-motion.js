(function (root) {
  'use strict';

  // Le mouvement du contenu de l'île. La forme de verre, elle, est la fenêtre de l'app : elle s'anime côté app
  // (desktop/island/morph.js, ressort 300 ms / 260 ms). Ici : fondus des couches (110 ms de retard à l'ouverture, la forme mène),
  // trajet de la grande entité d'une place à l'autre. La page ne retient de la géométrie que la cible, pour la donner à l'app.
  const W_COMPACT = 320;
  const W_OPEN = 760;
  const FADE_IN_MS = 220;
  // The window is resized natively and the page always paints a few frames behind it: outgoing content is cut at once
  // (never left frozen in a corner of the growing window), incoming content fades in early and grows with the shape.
  const FADE_OUT_MS = 0;
  const CONTENT_DELAY_MS = 40;
  const GROW_FROM = 0.96;
  const CONTENT_DELAY_CLOSE_MS = 70;
  const SETTLE_DELAY_MS = 80;
  const SPRING_OPEN = { zeta: 0.72, ms: 300 };
  const SPRING_CLOSE = { zeta: 0.9, ms: 260 };
  const SLOT_PX = { compact: 32, home: 96, wait: 64, order: 64, new: 64, park: 64 };
  const GEOMETRY_KEYS = ['w', 'h'];
  const ROOM_GAP = 8;
  const HERO_REST_PX = 32;

  const clamp01 = value => Math.min(1, Math.max(0, value));
  const isFadeKey = key => key.startsWith('o:') || key === 'oh' || key === 'ho';

  const createMotion = ctx => {
    const { win, doc, desktop, model, reduceQuery, $, islandEl, heroEl, stageEl } = ctx;
    // Strong ease-out, cubic-bezier(0.23, 1, 0.32, 1), for the incoming content.
  const easeOut = p => {
    // x(t) = 3·0.23·t(1−t)² + 3·0.32·t²(1−t) + t³, solved for t by Newton; y(t) with both control points at 1.
    let t = p;
    for (let i = 0; i < 8; i++) {
      const x = 0.69 * t * (1 - t) ** 2 + 0.96 * t * t * (1 - t) + t ** 3 - p;
      const dx = 0.69 * ((1 - t) ** 2 - 2 * t * (1 - t)) + 0.96 * (2 * t * (1 - t) - t * t) + 3 * t * t;
      if (Math.abs(dx) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - x / dx));
    }
    return 3 * t * (1 - t) ** 2 + 3 * t * t * (1 - t) + t ** 3;
  };
  const springs = { open: model.springEase(SPRING_OPEN, SPRING_OPEN.ms), close: model.springEase(SPRING_CLOSE, SPRING_CLOSE.ms), fade: easeOut };
    let cur = null;
    let tweens = {};
    let raf = 0;
    let settleTimer = 0;
    let lastRoom = -1;

    // Échelle de la morphose : 1, sauf réglage de mise au point posé par le lanceur de l'app (jamais par la page).
    const speed = () => (reduceQuery.matches ? 0 : ((desktop && Number(desktop.motionScale)) || 1));
    const hdrH = () => $('#hdr').offsetHeight;

    const slotOf = name => {
      const el = $('[data-slot]', ctx.layerEl(name));
      if (!el) return null;
      const a = el.getBoundingClientRect();
      const b = stageEl.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, size: SLOT_PX[name] };
    };

    const heightOf = view => {
      if (view === 'compact') return $('#v-compact .compact').offsetHeight;
      const layer = ctx.layerEl(view);
      layer.style.top = `${hdrH()}px`;
      return hdrH() + $('.is-body', layer).offsetHeight;
    };

    // Taille que la fenêtre doit prendre : l'île à sa phase et sa vue.
    const extentOf = (phase, view) => (phase === 'open' ? { w: W_OPEN, h: heightOf(view) } : { w: W_COMPACT, h: heightOf('compact') });

    const targetFor = (phase, view) => {
      for (const name of ctx.LAYERS) if (name !== 'compact') ctx.layerEl(name).style.top = `${hdrH()}px`;
      const extent = extentOf(phase === 'open' ? 'open' : 'compact', view);
      const target = { w: extent.w, h: phase === 'hidden' ? 0 : extent.h, hx: 0, hy: 0, hs: 1, ho: 1, oh: phase === 'open' ? 1 : 0 };
      for (const name of ctx.LAYERS) target[`o:${name}`] = 0;
      const place = slotOf(phase === 'open' ? view : 'compact');
      if (place) { target.hx = place.x; target.hy = place.y; target.hs = place.size / ctx.living.heroPx(); } else if (cur) { Object.assign(target, { hx: cur.hx, hy: cur.hy, hs: cur.hs }); }
      if (phase === 'compact') target['o:compact'] = 1;
      if (phase === 'open') { target[`o:${view}`] = 1; target.ho = view === 'new' ? 0 : 1; }
      return target;
    };

    const apply = () => {
      islandEl.dataset.hidden = ctx.S.phase === 'hidden' ? 'true' : 'false';
      heroEl.style.transform = `translate(${cur.hx}px, ${cur.hy}px) scale(${cur.hs})`;
      heroEl.style.opacity = cur.ho;
      $('#hdr').style.opacity = cur.oh;
      $('#hdr').style.transform = `scale(${GROW_FROM + (1 - GROW_FROM) * cur.oh})`;
      $('#hdr').style.visibility = cur.oh < 0.01 ? 'hidden' : 'visible';
      for (const name of ctx.LAYERS) {
        const el = ctx.layerEl(name);
        el.style.opacity = cur[`o:${name}`];
        el.style.transform = `scale(${GROW_FROM + (1 - GROW_FROM) * cur[`o:${name}`]})`;
        el.style.visibility = cur[`o:${name}`] < 0.01 ? 'hidden' : 'visible';
      }
      // Les toasts se posent sous l'île, où qu'elle en soit de sa morphose.
      const room = Math.round(cur.h) + ROOM_GAP;
      if (room !== lastRoom) { lastRoom = room; doc.body.style.setProperty('--dock-room', `${room}px`); }
    };

    const tweenOf = (key, to, isShrinking, t0, k) => {
      if (isFadeKey(key)) {
        const appearing = to > cur[key];
        const delay = appearing ? (isShrinking ? CONTENT_DELAY_CLOSE_MS : CONTENT_DELAY_MS) : 0;
        return { from: cur[key], to, t0, delay: delay * k, dur: (appearing ? FADE_IN_MS : FADE_OUT_MS) * k, ease: springs.fade };
      }
      return { from: cur[key], to, t0, delay: 0, dur: (isShrinking ? SPRING_CLOSE.ms : SPRING_OPEN.ms) * k, ease: isShrinking ? springs.close : springs.open };
    };

    const evaluate = now => {
      let active = false;
      for (const key of Object.keys(tweens)) {
        const tween = tweens[key];
        const p = tween.dur <= 0 ? 1 : clamp01((now - tween.t0 - tween.delay) / tween.dur);
        cur[key] = tween.from + (tween.to - tween.from) * tween.ease(p);
        if (p >= 1) { cur[key] = tween.to; delete tweens[key]; } else active = true;
      }
      return active;
    };

    const frame = () => {
      raf = 0;
      const active = evaluate(win.performance.now());
      apply();
      if (active) { raf = win.requestAnimationFrame(frame); return; }
      settle();
    };

    // Fin de morphose : les entités des vues cachées s'arrêtent, la grande entité reprend sa taille de repos.
    const settle = () => {
      win.clearTimeout(settleTimer);
      settleTimer = win.setTimeout(() => {
        ctx.living.unmountHidden();
        if (ctx.S.phase !== 'open' && !raf) ctx.living.rebaseHero(HERO_REST_PX);
      }, SETTLE_DELAY_MS);
    };

    // Les couches vont vers leur cible ; la géométrie (largeur, hauteur) est la cible de la fenêtre, prise tout de suite.
    const retarget = (target, isShrinking) => {
      const t0 = win.performance.now();
      const k = speed();
      for (const key of GEOMETRY_KEYS) cur[key] = target[key];
      for (const key of Object.keys(target)) {
        if (GEOMETRY_KEYS.includes(key) || (tweens[key] && tweens[key].to === target[key]) || (cur[key] === target[key] && !tweens[key])) continue;
        tweens[key] = tweenOf(key, target[key], isShrinking, t0, k);
      }
      if (!raf) raf = win.requestAnimationFrame(frame);
    };

    const snap = target => { cur = { ...target }; tweens = {}; apply(); settle(); };
    const start = target => { cur = { ...target }; apply(); };

    return {
      targetFor, extentOf, heightOf, retarget, snap, start, speed, apply,
      isStarted: () => cur !== null, heightNow: () => (cur ? cur.h : null), opacityOf: name => (cur ? cur[`o:${name}`] || 0 : 0),
      redraw: () => { if (cur) apply(); },
      rescaleHero: factor => {
        if (cur) cur.hs *= factor;
        if (tweens.hs) { tweens.hs.from *= factor; tweens.hs.to *= factor; }
      },
      cancelTweens: () => { tweens = {}; },
    };
  };

  const api = { createMotion, W_COMPACT, W_OPEN };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);
