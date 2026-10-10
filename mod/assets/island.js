(function (root) {
  'use strict';

  // L'île côté page : suit le pointeur (clics traversants), applique la phase
  // décidée par l'app (caché, réduit, ouvert) et coupe les animations quand elle est cachée.
  const SHAPE_SELECTOR = '.dock, .t-sheet, .wake';
  const ACTIVITY_THROTTLE_MS = 1000;
  // Même durée que --island-close dans conversations.html.
  const LEAVE_MS = 180;
  const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

  const isInsideShape = target => Boolean(target) && typeof target.closest === 'function' && target.closest(SHAPE_SELECTOR) !== null;

  const createPointerReporter = report => {
    let isInside = false;
    return value => {
      if (value === isInside) return;
      isInside = value;
      report(value);
    };
  };

  const statusChanges = (previous, rows) => {
    const next = new Map(rows.map(row => [row.engineId, row.status]));
    if (previous === null) return { hasChanged: false, next };
    const hasChanged = rows.some(row => previous.get(row.engineId) !== row.status);
    return { hasChanged, next };
  };

  const waitingCountOf = (rows, waitingStatuses) => rows.filter(row => waitingStatuses.includes(row.status)).length;

  const shouldPauseLoops = phase => phase === 'hidden';

  const createThrottle = (action, intervalMs, clock = Date.now) => {
    let lastAt = -Infinity;
    return () => {
      const now = clock();
      if (now - lastAt < intervalMs) return;
      lastAt = now;
      action();
    };
  };

  const init = ({ desktop, doc, win, identity, closeSheets }) => {
    const html = doc.documentElement;
    const motion = typeof win.matchMedia === 'function' ? win.matchMedia(REDUCED_MOTION_QUERY) : { matches: false };
    const reportPointer = createPointerReporter(isInside => desktop.islandPointer(isInside));
    const reportActivity = createThrottle(() => desktop.islandActivity(), ACTIVITY_THROTTLE_MS);
    let previousStatuses = null;
    let lastPinned = null;
    let leaveTimer = null;

    const setPhase = phase => {
      html.dataset.island = phase;
      if (shouldPauseLoops(phase)) identity?.pause();
      else identity?.resume();
    };

    // Un repli décidé par l'app : la fiche joue sa sortie, puis la page se vide.
    const foldSheets = () => {
      const sheet = doc.querySelector('.t-sheet');
      if (!sheet) return;
      if (motion.matches) { closeSheets(); return; }
      sheet.classList.add('leave');
      win.clearTimeout(leaveTimer);
      leaveTimer = win.setTimeout(closeSheets, LEAVE_MS);
    };

    const onPhase = phase => {
      setPhase(phase);
      if (phase !== 'open') foldSheets();
    };

    desktop.onIslandState(onPhase);
    desktop.islandMotion(motion.matches);
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', () => desktop.islandMotion(motion.matches));
    doc.addEventListener('mousemove', event => reportPointer(isInsideShape(event.target)));
    html.addEventListener('mouseleave', () => reportPointer(false));
    // Phase de capture : on voit la fiche avant que les autres écouteurs la ferment.
    // Échap referme d'abord la fiche (la page s'en charge), puis seulement cache l'île.
    doc.addEventListener('keydown', event => {
      reportActivity();
      if (event.key === 'Escape' && !doc.querySelector('.t-sheet')) desktop.islandEscape();
    }, true);
    doc.addEventListener('pointerdown', reportActivity);
    doc.addEventListener('input', reportActivity);
    setPhase('hidden');

    // Appelé à chaque rendu du dock : événement (révélation) et épinglage.
    const observe = (rows, waitingStatuses) => {
      const { hasChanged, next } = statusChanges(previousStatuses, rows);
      previousStatuses = next;
      if (hasChanged) desktop.islandEvent();
      const isPinned = waitingCountOf(rows, waitingStatuses) > 0;
      if (isPinned === lastPinned) return;
      lastPinned = isPinned;
      desktop.islandPinned(isPinned);
    };

    return { observe };
  };

  const api = { SHAPE_SELECTOR, ACTIVITY_THROTTLE_MS, LEAVE_MS, isInsideShape, createPointerReporter, statusChanges, waitingCountOf, shouldPauseLoops, createThrottle, init };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIsland = api;
})(typeof window !== 'undefined' ? window : globalThis);
