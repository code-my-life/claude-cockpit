(function (root) {
  'use strict';

  // L'île côté page : suit le pointeur, applique la phase décidée par l'app
  // (caché, réduit, ouvert), annonce les arrivées et coupe les animations quand elle est cachée.
  const SHAPE_SELECTOR = '.dock, .t-sheet';
  const ACTIVITY_THROTTLE_MS = 1000;
  // Même durée que --island-close dans conversations.html.
  const LEAVE_MS = 180;
  const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
  // Permission et question épinglent l'île ; « done » (mission livrée) l'épingle moins longtemps.
  const ATTENTION_STATUSES = ['permission', 'external'];
  const DONE_STATUSES = ['done'];
  const PIN_NONE = 'none';
  const PIN_ATTENTION = 'attention';
  const PIN_DONE = 'done';
  const CAUSE_EVENT = 'event';

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

  const pinKindOf = rows => {
    if (rows.some(row => ATTENTION_STATUSES.includes(row.status))) return PIN_ATTENTION;
    if (rows.some(row => DONE_STATUSES.includes(row.status))) return PIN_DONE;
    return PIN_NONE;
  };

  const announcementOf = count => {
    if (count <= 0) return null;
    return count === 1 ? '1 conversation t\'attend' : `${count} conversations t\'attendent`;
  };

  // Une attente nouvelle : un identifiant qui attend maintenant et n'attendait pas au rendu précédent.
  const hasNewWaiting = (previousIds, rows, waitingStatuses) => {
    if (previousIds === null) return false;
    return rows.some(row => waitingStatuses.includes(row.status) && !previousIds.has(row.engineId));
  };

  // Le dock est réécrit à chaque rendu : de quoi retrouver l'élément qui avait le focus.
  const focusSelectorOf = element => {
    if (!element || !element.dataset) return null;
    const { mini, engine, action } = element.dataset;
    const quote = value => String(value).replace(/(["\\])/g, '\\$1');
    if (mini) return `[data-mini="${quote(mini)}"]`;
    if (engine) return `[data-engine="${quote(engine)}"]${action ? `[data-action="${quote(action)}"]` : ''}`;
    return null;
  };

  // L'état d'une tête passe aussi par un mot (nom accessible, infobulle), pas seulement par le voile.
  const ZONE_WORDS = { working: 'au travail', later: 'remise à plus tard', stuck: 'bloquée' };
  const zoneWordOf = zone => ZONE_WORDS[zone] || '';

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

  // Fermeture différée de la fiche : annulable si une fiche se rouvre entre-temps.
  const createLeaveTimer = ({ setTimer, clearTimer, run, delayMs = LEAVE_MS }) => {
    let handle = null;
    const cancel = () => {
      if (handle === null) return;
      clearTimer(handle);
      handle = null;
    };
    return {
      cancel,
      isPending: () => handle !== null,
      schedule() {
        cancel();
        handle = setTimer(() => { handle = null; run(); }, delayMs);
      },
    };
  };

  const shouldAnnounce = (previousPhase, phase, cause) => previousPhase === 'hidden' && phase !== 'hidden' && cause === CAUSE_EVENT;

  const init = ({ desktop, doc, win, identity, closeSheets, announce, playSound = () => {}, onReveal = () => {} }) => {
    const html = doc.documentElement;
    const motion = typeof win.matchMedia === 'function' ? win.matchMedia(REDUCED_MOTION_QUERY) : { matches: false };
    const reportPointer = createPointerReporter(isInside => desktop.islandPointer(isInside));
    const reportActivity = createThrottle(() => desktop.islandActivity(), ACTIVITY_THROTTLE_MS);
    const leaveTimer = createLeaveTimer({ setTimer: (run, delay) => win.setTimeout(run, delay), clearTimer: handle => win.clearTimeout(handle), run: closeSheets });
    let previousStatuses = null;
    let lastPin = null;
    let waitingCount = 0;
    let waitingIds = null;
    let phase = 'hidden';

    const setPhase = next => {
      html.dataset.island = next;
      if (shouldPauseLoops(next)) identity?.pause();
      else identity?.resume();
    };

    // Un repli décidé par l'app : la fiche joue sa sortie, puis la page se vide.
    const foldSheets = () => {
      const sheet = doc.querySelector('.t-sheet');
      if (!sheet) return;
      if (motion.matches) { closeSheets(); return; }
      sheet.classList.add('leave');
      leaveTimer.schedule();
    };

    // Une fiche qui s'ouvre annule la fermeture différée de la précédente.
    const keepSheets = () => {
      leaveTimer.cancel();
      for (const sheet of doc.querySelectorAll('.t-sheet.leave')) sheet.classList.remove('leave');
    };

    const onPhase = (next, cause) => {
      const previous = phase;
      phase = next;
      setPhase(next);
      // Apparition de l'île : les volumes se tracent à mesure qu'elle se révèle.
      if (previous === 'hidden' && next !== 'hidden') {
        identity?.appear?.(doc.getElementById('dock'));
        playSound('appear');
        onReveal();
      }
      if (next === 'open') keepSheets();
      else foldSheets();
      if (shouldAnnounce(previous, next, cause)) {
        const message = announcementOf(waitingCount);
        if (message !== null) announce(message);
      }
    };

    desktop.onIslandState(onPhase);
    desktop.onIslandFocus(() => doc.querySelector('.dock button')?.focus());
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
      waitingCount = waitingCountOf(rows, waitingStatuses);
      const { hasChanged, next } = statusChanges(previousStatuses, rows);
      previousStatuses = next;
      if (hasChanged) desktop.islandEvent();
      const pin = pinKindOf(rows);
      const isNewWaiting = hasNewWaiting(waitingIds, rows, waitingStatuses);
      waitingIds = new Set(rows.filter(row => waitingStatuses.includes(row.status)).map(row => row.engineId));
      // Après un masquage forcé, l'épinglage se réarme à la prochaine attente nouvelle.
      if (pin === lastPin && !(isNewWaiting && pin !== PIN_NONE)) return;
      lastPin = pin;
      desktop.islandPinned(pin);
    };

    return { observe };
  };

  const api = {
    SHAPE_SELECTOR, ACTIVITY_THROTTLE_MS, LEAVE_MS, isInsideShape, createPointerReporter, statusChanges, waitingCountOf,
    pinKindOf, announcementOf, hasNewWaiting, focusSelectorOf, zoneWordOf, shouldPauseLoops, shouldAnnounce, createThrottle, createLeaveTimer, init,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIsland = api;
})(typeof window !== 'undefined' ? window : globalThis);
