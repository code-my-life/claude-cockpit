(function (root) {
  'use strict';

  // L'île côté page : l'orchestre. La phase (caché, réduit, ouvert) est décidée par l'automate de l'app ; ce module la reflète,
  // rend les vues (island-views.js), anime le contenu (island-motion.js), tient les entités vivantes (island-living.js),
  // branche les gestes (island-actions.js) et donne à l'app la taille que la fenêtre doit prendre : la fenêtre EST la forme.
  const HOVER_INTENT_MS = 120;
  const AGE_TICK_MS = 1000;
  const FOCUS_DELAY_MS = 200;
  const LAYERS = ['compact', 'home', 'wait', 'order', 'new', 'park'];
  const FIRST_FOCUS = '[data-act="reply"], [data-act="open"], [data-act="to-order"], .ep-tab[aria-selected="true"]';
  const FIELD_OF_VIEW = { wait: '#replyInput', order: '#orderInput', new: '#newSearch', park: '#parkInput' };

  const needs = (name, nodeFile) => (typeof module !== 'undefined' && module.exports ? require(nodeFile) : root[name]);
  const { shellHtml } = needs('CockpitIslandShell', './island-shell.js');
  const { createViews } = needs('CockpitIslandViews', './island-views.js');
  const { createLiving, HERO_PX } = needs('CockpitIslandLiving', './island-living.js');
  const { createMotion } = needs('CockpitIslandMotion', './island-motion.js');
  const { createActions } = needs('CockpitIslandActions', './island-actions.js');

  const rankOf = phase => (phase === 'hidden' ? 0 : phase === 'compact' ? 1 : 2);

  const initialState = () => ({
    phase: 'hidden', view: 'home', focusId: null, by: 'click', nextView: null, nextBy: 'click', rows: [], key: '', waitIds: null, folderKey: '',
    details: false, exact: false, parkKind: 'later', images: [], folders: [], picked: [], sounds: true, isPointerIn: false,
  });

  const create = ({ doc, win, host, model, entities, helpers, actions, desktop = null, announce = () => {} }) => {
    const S = initialState();
    const $ = (selector, scope = host) => scope.querySelector(selector);
    const $$ = (selector, scope = host) => [...scope.querySelectorAll(selector)];
    host.innerHTML = shellHtml();
    const ctx = {
      doc, win, host, model, entities, helpers, actions, desktop, announce, S, LAYERS, $, $$,
      reduceQuery: typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false },
      feed: model.createFeed({ max: 3 }),
      islandEl: $('#island'), stageEl: $('#stage'), heroEl: $('#hero'),
      layerEl: name => $(`#v-${name}`),
      rows: () => S.rows,
      focus: () => model.focusOf(S.rows, S.focusId),
      urgent: () => model.byUrgency(S.rows)[0] || null,
      waiting: () => model.waitingOf(S.rows).sort((a, b) => a.updatedAt - b.updatedAt),
      rowOf: id => S.rows.find(row => row.engineId === id) || null,
      canReply: row => Boolean(row) && model.canReply(row, { isServer: helpers.isServer }),
    };
    ctx.views = createViews(ctx);
    ctx.living = createLiving(ctx);
    ctx.motion = createMotion(ctx);
    ctx.act = createActions(ctx);
    let ageTimer = 0;
    let lastExtent = '';

    // ---------------------------------------------------------------- Rendu
    const focusKeyOf = el => {
      if (!el || !ctx.islandEl.contains(el) || !el.dataset) return null;
      if (el.dataset.act) return `[data-act="${el.dataset.act}"]`;
      return el.dataset.pick ? `[data-pick="${el.dataset.pick.replace(/"/g, '\\"')}"]` : null;
    };

    const renderViews = () => {
      const v = ctx.views;
      ctx.living.unmountIn(null);
      v.renderCompact();
      v.renderHomeText();
      v.renderPills();
      v.renderWait();
      v.renderOrder();
      v.renderPark();
      ctx.living.syncHero();
      ctx.living.mountVisible();
    };

    // Un rendu réécrit les vues : le focus clavier retrouve son bouton (par data-act ou data-pick).
    const renderAll = () => {
      const focusKey = focusKeyOf(doc.activeElement);
      renderViews();
      if (!focusKey) return;
      const again = $(focusKey, ctx.layerEl(S.phase === 'open' ? S.view : 'compact'));
      if (again) again.focus({ preventScroll: true });
    };

    const setTabs = view => {
      const home = ['home', 'wait', 'park'].includes(view) ? 'home' : view;
      for (const el of $$('.ep-tab')) {
        el.setAttribute('aria-selected', String(el.dataset.tab === home));
        el.tabIndex = el.dataset.tab === home ? 0 : -1;
      }
      $('#foldLabel').textContent = view === 'wait' ? 'Plus tard' : 'Replier';
    };

    // La fenêtre s'anime côté app (ressort 300 ms / 260 ms) : on lui donne la cible tout de suite, qu'elle grandisse ou rétrécisse.
    const pushExtent = (phase, view) => {
      if (!desktop) return;
      const { w, h } = ctx.motion.extentOf(phase, view);
      const key = `${phase}:${w}x${Math.round(h)}`;
      if (key === lastExtent) return;
      lastExtent = key;
      if (phase === 'open') desktop.setExpanded(true, w, Math.round(h), S.by === 'hover', S.by !== 'click');
      else desktop.setCompactSize(w, Math.round(h));
    };

    const applyInert = (phase, view) => {
      for (const name of LAYERS) ctx.layerEl(name).toggleAttribute('inert', !(phase === 'open' ? name === view : name === 'compact' && phase === 'compact'));
      $('#hdr').toggleAttribute('inert', phase !== 'open');
    };

    const startAges = () => { stopAges(); ageTimer = win.setInterval(ctx.views.ageTick, AGE_TICK_MS); };
    function stopAges() { if (ageTimer) { win.clearInterval(ageTimer); ageTimer = 0; } }

    const go = (phase, view, { silent = false } = {}) => {
      const previous = S.phase;
      S.phase = phase;
      S.view = view;
      if (phase !== 'open') { S.details = false; S.exact = false; S.focusId = (ctx.urgent() || {}).engineId || null; stopAges(); }
      if (phase === 'open') ctx.living.rebaseHero(HERO_PX);
      renderAll();
      const target = ctx.motion.targetFor(phase, view);
      const currentH = ctx.motion.heightNow();
      const isShrinking = rankOf(phase) < rankOf(previous) || (phase === previous && currentH !== null && target.h < currentH - 0.5);
      applyInert(phase, view);
      setTabs(view);
      if (!ctx.motion.isStarted()) ctx.motion.start(target);
      else if (silent || ctx.motion.speed() === 0) ctx.motion.snap(target);
      else ctx.motion.retarget(target, isShrinking);
      pushExtent(phase, view);
      if (phase === 'open') startAges();
      ctx.living.mountVisible();
      if (phase === 'hidden') entities.pause(); else entities.resume();
    };

    // ---------------------------------------------------------------- Phases et vues
    const focusFirst = view => {
      const selector = FIELD_OF_VIEW[view] || FIRST_FOCUS;
      const el = $(selector, ctx.layerEl(view)) || $(selector);
      if (el && !el.hidden && el.offsetParent !== null) el.focus({ preventScroll: true });
    };

    const switchView = (view, { by } = {}) => {
      if (S.phase !== 'open') return;
      if (by) S.by = by;
      go('open', view);
    };

    // Phase décidée par l'automate de l'app.
    const setPhase = phase => {
      if (phase === S.phase && phase !== 'open') return;
      if (phase !== 'open') {
        const hadFocus = ctx.islandEl.contains(doc.activeElement);
        go(phase, 'home');
        if (phase === 'compact' && hadFocus) $('#compactBtn').focus({ preventScroll: true });
        return;
      }
      const view = S.nextView || 'home';
      S.by = S.nextBy;
      S.nextView = null;
      if (view === 'wait') S.focusId = (ctx.waiting()[0] || {}).engineId || S.focusId;
      else if (!S.focusId || !ctx.rowOf(S.focusId)) S.focusId = (ctx.urgent() || {}).engineId || null;
      go('open', view);
      if (S.by === 'click') win.setTimeout(() => focusFirst(view), ctx.reduceQuery.matches ? 0 : FOCUS_DELAY_MS);
    };

    const openWith = (view, by) => {
      S.nextView = view;
      S.nextBy = by;
      if (S.phase === 'open') { switchView(view, { by }); return; }
      if (!desktop) { setPhase('open'); return; }
      renderAll();
      desktop.setExpanded(true, ctx.motion.extentOf('open', view).w, Math.round(ctx.motion.extentOf('open', view).h), by === 'hover', by !== 'click');
    };

    const fold = () => {
      if (S.phase !== 'open') return;
      if (!desktop) setPhase('compact');
      else desktop.islandEscape();
    };

    // ---------------------------------------------------------------- Pointeur
    const intent = model.createHoverIntent({
      delayMs: HOVER_INTENT_MS, setTimer: (run, ms) => win.setTimeout(run, ms), clearTimer: handle => win.clearTimeout(handle),
      onOpen: () => { if (S.isPointerIn && S.phase === 'compact') openWith('home', 'hover'); },
    });
    const pointer = isInside => {
      S.isPointerIn = isInside;
      if (isInside && S.phase === 'compact') intent.enter();
      if (!isInside) intent.leave();
    };

    // ---------------------------------------------------------------- Données de la page
    const relevantKey = list => JSON.stringify(list.map(row => [row.engineId, row.status, row.title, row.tool || '', row.summary && row.summary.awaiting, row.summary && row.summary.kind, row.park && row.park.reason, row.stats && row.stats.messages, row.isCurrent, row.hostId, row.cwd]));

    const onFreshWait = row => {
      announce(`${row.title} t'attend`);
      S.focusId = row.engineId;
      if (S.phase !== 'open') { openWith('wait', 'event'); return; }
      if (S.view === 'home' || S.view === 'wait') switchView('wait');
    };

    const takeFolders = folders => {
      if (!Array.isArray(folders) || folders.join('|') === S.folderKey) return;
      S.folderKey = folders.join('|');
      S.folders = folders;
      ctx.views.renderNewList();
    };

    const update = (list, { folders, sounds } = {}) => {
      S.rows = list;
      takeFolders(folders);
      if (typeof sounds === 'boolean' && sounds !== S.sounds) { S.sounds = sounds; if (S.phase === 'open') ctx.views.renderPills(); }
      ctx.feed.observe(list, Date.now(), ctx.views.activityLabel);
      const fresh = model.newWaitOf(S.waitIds, list);
      S.waitIds = model.waitingIdsOf(list);
      const key = `${relevantKey(list)}|${S.focusId}|${S.view}|${S.phase}|${S.details}`;
      if (key !== S.key) {
        S.key = key;
        if (S.phase === 'hidden') ctx.views.renderCompact();
        else { if (S.focusId && !ctx.rowOf(S.focusId)) S.focusId = (ctx.urgent() || {}).engineId || null; go(S.phase, S.view); }
      }
      if (S.phase === 'open' && S.view === 'wait' && S.waitIds.size === 0) switchView('home');
      if (fresh) onFreshWait(fresh);
    };

    ctx.ui = {
      fold, switchView, openWith, focusFirst,
      refresh: () => { if (S.phase === 'open') go('open', S.view); },
      interacted: () => { if (S.by === 'hover') S.by = 'click'; },
    };
    ctx.act.wire();
    ctx.living.wirePointer();
    if (ctx.reduceQuery.addEventListener) ctx.reduceQuery.addEventListener('change', () => ctx.motion.cancelTweens());
    ctx.views.renderNewList();
    renderAll();
    go('hidden', 'home', { silent: true });

    // Thème choisi par l'app selon le bureau derrière (Nuit ou Papier) : les jetons de l'île suivent.
    const setTheme = theme => { ctx.islandEl.dataset.theme = theme === 'light' ? 'light' : 'dark'; };

    return {
      setPhase, setTheme, update, openWith, fold, pointer, dispose: () => { stopAges(); ctx.living.dispose(); },
      isOpen: () => S.phase === 'open', stateOf: () => ({ phase: S.phase, view: S.view, focusId: S.focusId }),
    };
  };

  const api = { create, HOVER_INTENT_MS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandUi = api;
})(typeof window !== 'undefined' ? window : globalThis);
