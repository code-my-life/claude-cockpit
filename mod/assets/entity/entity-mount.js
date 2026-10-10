(function (root) {
  'use strict';

  // Aide d'animation : monte une entité sur un canvas. Une seule boucle partagée, suivi du curseur, survol et clics,
  // arrêt automatique quand le canvas est retiré du document, saut des entités masquées, pause quand la fenêtre est masquée.
  // Dépend seulement de entity.js (CharacterCore.renderCharacter) et du navigateur.
  const C = root.CharacterCore;
  const FPS_ACTIVE = 30;
  const FPS_SLEEP = 12;
  // Une entité « still » ne s'anime que le temps d'une réaction (changement d'état, survol, clic) puis garde sa dernière image.
  const STILL_ANIMATE_MS = 1600;
  const PRESS_ANIMATE_MS = 3000;
  const REPEAT_WINDOW_MS = 1400;
  const HOVER_EASE_MS = 90;
  const GAZE_EASE_MS = 110;
  const entities = new Set();
  const byCanvas = new WeakMap();
  const cursor = { x: null, y: null };
  const calm = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const isCalm = () => Boolean(calm && calm.matches);
  const stats = { frames: 0, drawMs: 0, draws: 0 };
  let rafId = 0;
  let lastFrame = 0;
  let isListening = false;
  // Pause demandée par l'hôte (île cachée) : plus aucune image dessinée, plus de rappel d'animation.
  let isPaused = false;

  const observer = typeof IntersectionObserver === 'undefined' ? null
    : new IntersectionObserver(items => { for (const item of items) { const e = byCanvas.get(item.target); if (e) { e.isVisible = item.isIntersecting; if (e.isVisible) { e.needsStatic = true; wake(); } } } });

  const drawOne = (e, now, dt) => {
    const rect = e.canvas.getBoundingClientRect();
    let gaze = null;
    if (!isCalm() && cursor.x !== null) {
      const tx = cursor.x - (rect.left + rect.width / 2), ty = cursor.y - (rect.top + rect.height / 2);
      if (e.gx === null) { e.gx = tx; e.gy = ty; }
      const k = 1 - Math.exp(-dt / GAZE_EASE_MS);
      e.gx += (tx - e.gx) * k; e.gy += (ty - e.gy) * k;
      gaze = { dx: e.gx, dy: e.gy };
    } else e.gx = null;
    e.hover += (e.hoverTarget - e.hover) * (1 - Math.exp(-dt / HOVER_EASE_MS));
    if (Math.abs(e.hoverTarget - e.hover) < 0.002) e.hover = e.hoverTarget;
    const press = e.press ? { count: e.press.count, since: now - e.press.at } : null;
    const started = root.performance.now();
    C.renderCharacter(e.seed, e.size, e.state, {
      canvas: e.canvas, t: now, gaze, hover: e.hover, press, since: now - e.changedAt, prev: e.prev, reduced: isCalm(),
    });
    stats.drawMs += root.performance.now() - started;
    stats.draws += 1;
    e.lastDraw = now;
  };

  // La boucle ne tourne que si une entité a quelque chose à dessiner : au rythme de la plus rapide, et pas du tout quand
  // toutes sont « still » au repos (aucun rappel d'animation, aucun réveil du processus de rendu).
  let timerId = 0;
  const plan = gap => {
    if (gap === Infinity) return;
    if (gap <= 20) rafId = root.requestAnimationFrame(frame);
    else timerId = root.setTimeout(() => { timerId = 0; rafId = root.requestAnimationFrame(frame); }, gap - 10);
  };

  const frame = now => {
    rafId = 0;
    if (entities.size === 0 || root.document.hidden || isPaused) return;
    if (lastFrame === 0) lastFrame = now - 1000 / FPS_ACTIVE;
    const dt = Math.min(200, now - lastFrame);
    lastFrame = now;
    stats.frames += 1;
    let nextGap = Infinity;
    for (const e of [...entities]) {
      if (!e.canvas.isConnected) { e.destroy(); continue; }
      if (!e.isVisible) continue;
      if (isCalm()) { if (e.needsStatic) { drawOne(e, now, dt); e.needsStatic = false; } continue; }
      const isReacting = e.hoverTarget !== 0 || e.hover !== 0 || (e.press && now - e.press.at < PRESS_ANIMATE_MS) || now - e.changedAt < STILL_ANIMATE_MS;
      if (e.still && !isReacting) { if (e.needsStatic) { drawOne(e, now, dt); e.needsStatic = false; } continue; }
      const sleeping = e.state === 'sleep' && e.hoverTarget === 0 && !e.press;
      const gap = 1000 / (sleeping ? FPS_SLEEP : e.fps);
      if (now - e.lastDraw >= gap - 2) drawOne(e, now, now - e.lastDraw > 500 ? dt : Math.max(1, now - e.lastDraw));
      nextGap = Math.min(nextGap, gap);
    }
    plan(nextGap);
  };

  const wake = () => { if (!rafId && !timerId && entities.size > 0 && !root.document.hidden && !isPaused) { lastFrame = 0; rafId = root.requestAnimationFrame(frame); } };
  const stopLoop = () => {
    if (rafId) { root.cancelAnimationFrame(rafId); rafId = 0; }
    if (timerId) { root.clearTimeout(timerId); timerId = 0; }
  };
  const pause = () => { isPaused = true; stopLoop(); };
  const resume = () => { if (!isPaused) return; isPaused = false; for (const e of entities) e.needsStatic = true; wake(); };

  const listen = () => {
    if (isListening) return;
    isListening = true;
    root.addEventListener('pointermove', event => { cursor.x = event.clientX; cursor.y = event.clientY; }, { passive: true });
    root.document.documentElement.addEventListener('pointerleave', () => { cursor.x = null; cursor.y = null; });
    root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) stopLoop(); else wake(); });
    const redrawStatic = () => { for (const e of entities) e.needsStatic = true; wake(); };
    if (calm && calm.addEventListener) calm.addEventListener('change', redrawStatic);
    root.addEventListener('resize', redrawStatic);
  };

  const registerPress = (previous, now) => ({ count: previous && now - previous.at < REPEAT_WINDOW_MS ? previous.count + 1 : 1, at: now });

  // mount(canvas, { seed, size, state, hoverTarget }) -> { setState, setSeed, setSize, press, hover, destroy }
  const mount = (canvas, options) => {
    listen();
    const target = options.hoverTarget || canvas;
    const e = {
      canvas, seed: options.seed, size: options.size, state: options.state || 'idle', prev: null, changedAt: root.performance.now(),
      gx: null, gy: null, hover: 0, hoverTarget: 0, press: null, isVisible: true, lastDraw: 0, needsStatic: true,
      fps: options.fps || FPS_ACTIVE, still: options.still === true,
    };
    const onEnter = () => { e.hoverTarget = 1; wake(); };
    const onLeave = () => { e.hoverTarget = 0; };
    const onDown = () => { e.press = registerPress(e.press, root.performance.now()); wake(); };
    target.addEventListener('pointerenter', onEnter);
    target.addEventListener('pointerleave', onLeave);
    target.addEventListener('pointerdown', onDown);
    e.destroy = () => {
      if (!entities.delete(e)) return;
      target.removeEventListener('pointerenter', onEnter);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointerdown', onDown);
      if (observer) observer.unobserve(canvas);
      byCanvas.delete(canvas);
      if (entities.size === 0) stopLoop();
    };
    entities.add(e);
    byCanvas.set(canvas, e);
    if (observer) observer.observe(canvas);
    drawOne(e, root.performance.now(), 16);
    wake();
    return {
      setState: state => { if (state !== e.state) { e.prev = e.state; e.state = state; e.changedAt = root.performance.now(); e.needsStatic = true; wake(); } },
      setSeed: seed => { e.seed = seed; e.needsStatic = true; },
      setSize: size => { e.size = size; e.needsStatic = true; wake(); },
      setFps: fps => { e.fps = fps || FPS_ACTIVE; },
      setStill: isStill => { e.still = isStill === true; e.needsStatic = true; wake(); },
      press: () => { e.press = registerPress(e.press, root.performance.now()); wake(); },
      hover: isOn => { e.hoverTarget = isOn ? 1 : 0; wake(); },
      destroy: e.destroy,
    };
  };

  root.CharacterEntity = {
    mount, renderCharacter: C.renderCharacter, STATES: C.STATES, STATUS_TO_STATE: C.STATUS_TO_STATE,
    pause, resume,
    stats: () => ({ ...stats, active: entities.size, isRunning: rafId !== 0, isPaused }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
