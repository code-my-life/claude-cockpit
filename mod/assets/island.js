(function (root) {
  'use strict';

  // L'île côté page : suit le pointeur, relaie la phase décidée par l'app (caché, réduit, ouvert) à l'interface,
  // annonce les arrivées, épingle l'île quand quelqu'un attend et coupe les animations quand elle est cachée.
  const model = typeof module !== 'undefined' && module.exports ? require('./island-model.js') : root.CockpitIslandModel;
  const SHAPE_SELECTOR = '.island';
  const ACTIVITY_THROTTLE_MS = 1000;
  const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
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

  // Qui t'attend : une permission, une question, une attente d'autre chose (jamais une mission livrée).
  const waitingCountOf = rows => model.waitingOf(rows).length;

  // Une question à laquelle on peut répondre depuis l'île, ou une autorisation que l'île tient, épingle l'île (110 s au plus, plafond de l'automate) ; une mission livrée
  // l'épingle moins longtemps. Ce qu'on ne peut pas traiter ici (permission, conversation qui fait tourner le cockpit, cockpit sans
  // serveur) ne retient pas l'île : la pastille garde le signal sans la bloquer ouverte.
  const pinKindOf = (rows, { isServer = true, permissions = [] } = {}) => {
    if (model.waitingOf(rows).some(row => model.canReply(row, { isServer }) || model.canDecide(row, permissions))) return PIN_ATTENTION;
    if (rows.some(row => model.kindOf(row) === model.KIND_DONE)) return PIN_DONE;
    return PIN_NONE;
  };

  const announcementOf = count => {
    if (count <= 0) return null;
    return count === 1 ? '1 conversation t\'attend' : `${count} conversations t'attendent`;
  };

  // Une attente nouvelle : un identifiant qui attend maintenant et n'attendait pas au rendu précédent.
  const hasNewWaiting = (previousIds, rows) => model.newWaitOf(previousIds, rows) !== null;

  const shouldPauseLoops = phase => phase === 'hidden';

  // Les toasts de l'île se posent sous la forme : la fenêtre a la taille de la scène, la forme cliquable
  // s'étend le temps des toasts visibles. Largeur des toasts du modèle (min(380px, ...)) et marge sous le dernier.
  const TOAST_WIDTH = 380;
  const TOAST_MARGIN = 8;

  const toastExtentOf = (count, scrollHeight) => (count > 0 ? { width: TOAST_WIDTH, height: Math.ceil(scrollHeight) + TOAST_MARGIN } : { width: 0, height: 0 });

  // Prévient quand la zone des toasts change (arrivée, départ, hauteur) ; la zone est créée à la demande par le modèle.
  const watchToasts = (doc, win, onChange) => {
    let host = null;
    const attach = () => {
      const found = doc.querySelector('.ep-toasts');
      if (found === null || found === host) return;
      host = found;
      // Les toasts de l'île flottent sur le bureau sans scène : surface papier, fond --plate opaque (pas de verre).
      host.dataset.surface = 'paper';
      new win.MutationObserver(onChange).observe(host, { childList: true });
      if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(onChange).observe(host);
      onChange();
    };
    new win.MutationObserver(attach).observe(doc.body, { childList: true });
    attach();
  };

  const createThrottle = (action, intervalMs, clock = Date.now) => {
    let lastAt = -Infinity;
    return () => {
      const now = clock();
      if (now - lastAt < intervalMs) return;
      lastAt = now;
      action();
    };
  };

  const shouldAnnounce = (previousPhase, phase, cause) => previousPhase === 'hidden' && phase !== 'hidden' && cause === CAUSE_EVENT;

  const init = ({ desktop, doc, win, isServer = true, announce, playSound = () => {}, onReveal = () => {}, onPhase = () => {}, onPointer = () => {} }) => {
    const html = doc.documentElement;
    const motion = typeof win.matchMedia === 'function' ? win.matchMedia(REDUCED_MOTION_QUERY) : { matches: false };
    const reportPointer = createPointerReporter(isInside => { desktop.islandPointer(isInside); onPointer(isInside); });
    const reportActivity = createThrottle(() => desktop.islandActivity(), ACTIVITY_THROTTLE_MS);
    let previousStatuses = null;
    let lastPin = null;
    let waitingCount = 0;
    let waitingIds = null;
    let phase = 'hidden';

    const onPhaseChange = (next, cause) => {
      const previous = phase;
      phase = next;
      html.dataset.island = next;
      // Apparition de l'île : le son d'apparition (coupé par défaut) et l'annonce du premier lancement.
      if (previous === 'hidden' && next !== 'hidden') {
        playSound('appear');
        onReveal();
      }
      onPhase(next, cause);
      if (shouldAnnounce(previous, next, cause)) {
        const message = announcementOf(waitingCount);
        if (message !== null) announce(message);
      }
    };

    desktop.onIslandState(onPhaseChange);
    // « Afficher l'île » (barre d'état) : le focus va à la pastille.
    desktop.onIslandFocus(() => doc.getElementById('compactBtn')?.focus());
    desktop.islandMotion(motion.matches);
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', () => desktop.islandMotion(motion.matches));
    doc.addEventListener('mousemove', event => reportPointer(isInsideShape(event.target)));
    html.addEventListener('mouseleave', () => reportPointer(false));
    // Phase de capture : les menus de la page se ferment d'abord (ils arrêtent la propagation), puis Échap replie l'île.
    doc.addEventListener('keydown', event => {
      reportActivity();
      if (event.key === 'Escape') desktop.islandEscape();
    }, true);
    doc.addEventListener('pointerdown', reportActivity);
    doc.addEventListener('input', reportActivity);
    html.dataset.island = 'hidden';

    // Appelé à chaque rendu : événement (révélation) et épinglage.
    const observe = (rows, permissions = []) => {
      waitingCount = waitingCountOf(rows);
      const { hasChanged, next } = statusChanges(previousStatuses, rows);
      previousStatuses = next;
      if (hasChanged) desktop.islandEvent();
      const pin = pinKindOf(rows, { isServer, permissions });
      const isNewWaiting = hasNewWaiting(waitingIds, rows);
      waitingIds = model.waitingIdsOf(rows);
      // Après un masquage forcé, l'épinglage se réarme à la prochaine attente nouvelle.
      if (pin === lastPin && !(isNewWaiting && pin !== PIN_NONE)) return;
      lastPin = pin;
      desktop.islandPinned(pin);
    };

    return { observe };
    };

    const UPDATE_NOTICE = 'Le cockpit a été mis à jour, redémarre Claude Desktop';

    const staleNoticeOf = () => {
      const served = root.__CONVERSATIONS__ && root.__CONVERSATIONS__.pageVersion;
      const mine = root.__PAGE_VERSION__;
      if (!served || !mine) return null;
      return served === mine ? null : UPDATE_NOTICE;
    };

    const api = {
    SHAPE_SELECTOR, ACTIVITY_THROTTLE_MS, isInsideShape, createPointerReporter, statusChanges, waitingCountOf,
    pinKindOf, announcementOf, hasNewWaiting, shouldPauseLoops, TOAST_WIDTH, TOAST_MARGIN, toastExtentOf, watchToasts, shouldAnnounce, createThrottle, init,
    staleNoticeOf,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIsland = api;
})(typeof window !== 'undefined' ? window : globalThis);
