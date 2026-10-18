(function (root) {
  'use strict';

  // Les gestes dans l'île : clics, formulaires, clavier, collage d'image. Chaque action appelle une fonction réelle du cockpit
  // (fournie par la page dans `actions`) ; ce module ne connaît ni le réseau ni les dossiers.
  const TAB_ORDER = ['home', 'order', 'new'];
  const PARK_FOCUS_DELAY_MS = 60;

  const createActions = ctx => {
    const { S, win, doc, host, $, islandEl, actions, announce } = ctx;
    const ui = () => ctx.ui;

    const resolveReply = async (id, text, images) => {
      const row = ctx.rowOf(id);
      if (!(await actions.reply(id, text, images))) return false;
      S.images = [];
      ctx.views.renderOrderThumbs();
      announce(`Réponse envoyée à ${row ? row.title : 'la conversation'}`);
      ui().fold();
      return true;
    };

    // Envoie le texte d'un champ ; le champ reste focalisé (lecture seule le temps de l'envoi) et se vide si l'envoi a réussi.
    const submitField = async (input, row, text, images) => {
      input.readOnly = true;
      if (await resolveReply(row.engineId, text, images)) input.value = '';
      input.readOnly = false;
    };

    const onSubmitReply = async event => {
      event.preventDefault();
      const row = ctx.waiting()[0] || ctx.focus();
      const input = $('#replyInput');
      const text = input.value.trim();
      if (row && text.length > 0) await submitField(input, row, text, []);
    };

    const onSubmitOrder = async event => {
      event.preventDefault();
      const row = ctx.focus();
      const input = $('#orderInput');
      const text = input.value.trim();
      if (!row || (text.length === 0 && S.images.length === 0)) return;
      await submitField(input, row, text, S.images.map(image => ({ type: image.type, base64: image.base64, url: image.url })));
    };

    const onSubmitPark = async event => {
      event.preventDefault();
      const row = ctx.focus();
      if (row && await actions.park(row.engineId, S.parkKind, $('#parkInput').value.trim())) { $('#parkInput').value = ''; ui().switchView('home'); }
    };

    const startNewConv = () => {
      const error = actions.newConv(S.picked, $('#newInput').value.trim());
      $('#newNote').textContent = error || '';
      if (error) return;
      S.picked = [];
      $('#newInput').value = '';
      ctx.views.renderNewList();
      ui().fold();
    };

    const readImage = file => new Promise(resolve => {
      const reader = new win.FileReader();
      reader.onload = () => { const url = String(reader.result); resolve({ type: file.type || 'image/png', base64: url.split(',')[1], url }); };
      reader.readAsDataURL(file);
    });

    const onPaste = async event => {
      const items = event.clipboardData && event.clipboardData.items ? [...event.clipboardData.items] : [];
      const files = items.filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile());
      if (files.length === 0) return;
      event.preventDefault();
      for (const file of files) S.images.push(await readImage(file));
      ctx.views.renderOrderThumbs();
      ui().refresh();
    };

    // Refuser, Autoriser ou Toujours : ignoré tant que la demande n'est pas armée, puis l'île se replie si l'app a pris la décision.
    const decide = async el => {
      const row = ctx.waiting()[0] || ctx.focus();
      const ask = row ? ctx.model.permissionOf(S.permissions, row.engineId) : null;
      if (ask === null || !ctx.model.isDecisionArmed(S.permShownAt, Date.now())) return;
      if (!(await actions.decide(ask.requestId, el.dataset.decision))) return;
      S.permissions = S.permissions.filter(entry => entry.requestId !== ask.requestId);
      const said = { deny: 'Refusé', defer: 'Rendu à Claude' }[el.dataset.decision] || 'Autorisé';
      announce(`${said} pour ${row.title}`);
      ui().fold();
    };

    const onFocused = fn => () => { const row = ctx.focus(); if (row) fn(row); };
    const act = {
      reply: () => ui().switchView('wait'),
      open: onFocused(row => actions.open(row)),
      'to-order': () => ui().switchView('order'),
      diff: el => { const at = Number(el.dataset.at); S.diff = S.diff && S.diff.at === at ? null : { at }; S.details = false; ui().refresh(); },
      'diff-close': () => { S.diff = null; ui().refresh(); },
      details: () => { S.diff = null; S.details = !S.details; if (S.details) actions.ensureSummary(ctx.focus()); ui().refresh(); },
      exact: () => { const row = ctx.focus(); if (row) { S.exact = !S.exact; ui().refresh(); } },
      summarize: onFocused(row => actions.summarize(row.engineId)),
      terminal: onFocused(row => actions.terminal(row.engineId)),
      seen: onFocused(row => { actions.seen(row.engineId); S.details = false; ui().refresh(); }),
      unpark: onFocused(row => actions.unpark(row.engineId)),
      park: el => { S.parkKind = el.dataset.kind === 'blocked' ? 'blocked' : 'later'; $('#parkInput').value = ''; ui().switchView('park'); win.setTimeout(() => ui().focusFirst('park'), PARK_FOCUS_DELAY_MS); },
      'park-cancel': () => ui().switchView('home'),
      'park-chip': el => { actions.park((ctx.focus() || {}).engineId, S.parkKind, el.dataset.reason).then(ok => { if (ok) ui().switchView('home'); }); },
      perm: el => { decide(el); },
      quick: el => { const row = ctx.waiting()[0] || ctx.focus(); if (row) resolveReply(row.engineId, el.dataset.text, []); },
      'rm-image': el => { S.images.splice(Number(el.dataset.index), 1); ctx.views.renderOrderThumbs(); ui().refresh(); },
      search: () => actions.openCockpit('search'),
      cockpit: () => actions.openCockpit(null),
      sounds: () => actions.setSounds(!S.sounds),
      quit: () => actions.quit(),
      big: () => { const row = ctx.focus(); if (row) { ctx.deck.setBig(row.engineId); ui().refresh(); } },
      toggle: () => { const row = ctx.focus(); if (row) { ctx.deck.collapseCard(row.engineId); ui().refresh(); } },
    };

    const onClick = event => {
      const el = event.target.closest('button, a, [data-pick]');
      if (!el || !islandEl.contains(el)) return;
      if (el.tagName === 'A') event.preventDefault();
      if (el.id === 'compactBtn') { ui().openWith('home', 'click'); return; }
      ui().interacted();
      if (el.id === 'foldBtn') { ui().fold(); return; }
      if (el.dataset.tab) { S.focusId = (ctx.focus() || {}).engineId || null; ui().switchView(el.dataset.tab); return; }
      if (el.dataset.pick) { S.diff = null; S.focusId = el.dataset.pick; ui().switchView(S.view === 'order' ? 'order' : 'home'); return; }
      if (el.id === 'startBtn') { startNewConv(); return; }
      const handler = act[el.dataset.act];
      if (handler) handler(el);
    };

    // Flèches, Début, Fin entre les onglets : l'onglet actif prend le focus (tabindex tournant).
    const onTabKeys = event => {
      const active = doc.activeElement;
      const current = TAB_ORDER.indexOf(active && active.dataset ? active.dataset.tab : '');
      const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: TAB_ORDER.length - 1 }[event.key];
      if (next === undefined || current < 0) return;
      event.preventDefault();
      const view = TAB_ORDER[(next + TAB_ORDER.length) % TAB_ORDER.length];
      ui().switchView(view);
      $(`#tab-${view}`).focus();
    };

    const onEnterSends = (submit, allowShift) => event => {
      if (event.key !== 'Enter' || event.isComposing || (allowShift && event.shiftKey)) return;
      event.preventDefault();
      submit();
    };

    const wire = () => {
      host.addEventListener('click', onClick);
      host.addEventListener('submit', event => event.preventDefault());
      $('#replyForm').addEventListener('submit', onSubmitReply);
      $('#orderForm').addEventListener('submit', onSubmitOrder);
      $('#parkForm').addEventListener('submit', onSubmitPark);
      $('#orderInput').addEventListener('paste', onPaste);
      $('#orderInput').addEventListener('keydown', onEnterSends(() => $('#orderForm').requestSubmit(), true));
      $('#newInput').addEventListener('keydown', onEnterSends(startNewConv, false));
      $('#newSearch').addEventListener('input', ctx.views.renderNewList);
      $('#newList').addEventListener('change', event => {
        const others = S.picked.filter(item => item !== event.target.value);
        S.picked = event.target.checked ? [...others, event.target.value] : others;
        ctx.views.renderNewList();
      });
      $('#tabs').addEventListener('keydown', onTabKeys);
      host.addEventListener('pointerdown', event => { if (!event.target.closest('.compact')) ui().interacted(); });
    };

    return { wire, resolveReply };
  };

  const api = { createActions };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandActions = api;
})(typeof window !== 'undefined' ? window : globalThis);
