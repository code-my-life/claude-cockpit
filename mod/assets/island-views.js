(function (root) {
  'use strict';

  // Les vues de l'île : du HTML à partir des conversations. Les formulaires (réponse, ordre, nouvelle conversation, mise de côté)
  // sont fixes (island-shell.js) et jamais réécrits : seuls leurs textes et leurs listes changent ici.
  const OTHERS_SHOWN = 4;
  const RAIL_SHOWN = 3;
  const HAND_SHOWN = 3;
  const FOLDER_LIST_MAX = 120;
  const PARK_KINDS = {
    blocked: { title: 'Bloquée par…', ok: 'Marquer bloquée', chips: ['Attente client', 'Attente d\'un collègue', 'Accès manquant', 'Bug externe'] },
    later: { title: 'Je reviens dessus…', ok: 'Mettre de côté', chips: ['Pas prioritaire', 'Après la mise en prod', 'Demain', 'Quand j\'ai le temps'] },
  };
  const upperFirst = text => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

  const createViews = ctx => {
    const { S, model, helpers, desktop, feed, $, $$, layerEl } = ctx;
    const { esc, icon, markdown, ageOf, activityOf, awaitingOf, statsLineOf, openUrlOf, folderOf, isServer, quickRepliesOf } = helpers;
    const activityLabel = row => upperFirst(activityOf(row)[1]);
    // Infobulle Encre et Papier (data-ep-tip) : les boutons à icône seule disent leur nom au survol et au focus.
    const tipOf = label => `data-ep-tip="${esc(label)}" aria-label="${esc(label)}"`;
    const smallButton = (act, label, glyph, extra = '') => `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="${act}" ${extra}>${icon(glyph)} ${label}</button>`;

    const tagOf = row => {
      const sig = model.signalOf(row);
      // As on the cockpit cards, only a permission is amber with its warning picto; a question shows its own.
      const tone = sig.kind === model.KIND_WAIT && row.status !== 'permission' ? '' : sig.tone;
      return { cls: `ep-tag${tone ? ` ep-tag--${tone}` : ''}`, lead: tone ? '' : icon(sig.icon), word: sig.word };
    };
    // As on the cockpit cards: the state is a picto alone, its word in the tooltip and for screen readers.
    const tagHtml = row => { const tag = tagOf(row); return `<span class="${tag.cls} is-state" role="img" aria-label="${esc(tag.word)}" data-ep-tip="${esc(tag.word)}">${tag.lead}</span>`; };
    // Rewrites a block only when its markup changed. A block holding mini cards must not be rebuilt on each render: a
    // <sg-card> taken out of the page and put back starts again from scratch (canvas, text texture, WebGPU pipeline),
    // about 25 ms each, which froze the page for some 300 ms when the island opened.
    const setHtml = (el, html) => { if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; } };
    const setTag = (el, row, word) => { const tag = tagOf(row); el.className = tag.cls; el.innerHTML = `${tag.lead}${esc(word || tag.word)}`; };
    const canvasHtml = (row, size) => `<canvas class="ent" data-ent="${esc(row.engineId)}" data-size="${size}" data-state="${model.entityStateOf(row)}" aria-hidden="true"></canvas>`;
    // En cartes, une mini-carte (posée après le rendu par island-deck.js) remplace la petite entité.
    const headHtml = (row, size) => (ctx.cards ? `<span class="mini-slot" data-mini-slot="${esc(row.engineId)}" style="--mini: ${size}px"></span>` : canvasHtml(row, size));
    const heroRowFor = view => (view === 'wait' ? ctx.waiting()[0] || ctx.focus() : ctx.focus());

    // Une ligne du fil : l'étape, ses lignes ajoutées et retirées (icône et chiffres, jamais la couleur seule), et pour une
    // modification dont le mod a gardé le texte, un bouton qui ouvre son diff sous la carte.
    const countsHtml = line => (typeof line.added === 'number' ? `<span class="spec counts" aria-label="${line.added} lignes ajoutées, ${line.removed} retirées"><span class="add">+${line.added}</span> <span class="del">−${line.removed}</span></span>` : '');
    const stepHtml = line => {
      if (line.diffAt === null || line.diffAt === undefined) return `<span class="t">${esc(line.label)}</span>`;
      const isOpen = Boolean(S.diff && S.diff.at === line.diffAt);
      return `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm is-step" data-act="diff" data-at="${line.diffAt}" aria-expanded="${isOpen}" aria-controls="details" data-ep-tip="Voir le diff">${esc(line.label)}</button>`;
    };
    const feedHtml = row => feed.linesOf(row, activityLabel).map(line => `<li class="body-s${line.isCurrent ? ' now' : ''}"><span aria-hidden="true">${icon(line.isCurrent ? 'play' : 'check')}</span>${stepHtml(line)}${countsHtml(line)}</li>`).join('');

    // Le diff d'une étape : les lignes retirées puis ajoutées, chacune marquée − ou +.
    const NL = '\n';
    const diffLinesHtml = (text, mark, cls) => (text === '' ? '' : text.split(NL).map(line => `<span class="${cls}">${mark} ${esc(line)}</span>`).join(NL));
    const diffHtml = step => {
      const before = diffLinesHtml(step.diff.before, '−', 'del');
      const after = diffLinesHtml(step.diff.after, '+', 'add');
      const head = `<div class="is-meta"><span class="caption-s">${esc(step.file || step.label)}</span>${countsHtml(step)}<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="diff-close">Fermer</button></div>`;
      return `<div class="is-diff">${head}<pre class="ep-code is-diffcode" tabindex="0" aria-label="Diff de ${esc(step.label)}">${[before, after].filter(Boolean).join(NL)}</pre></div>`;
    };
    const diffStepOf = row => (S.diff && row && Array.isArray(row.steps) ? row.steps.find(step => step.at === S.diff.at && step.diff) || null : null);

    const bodyOf = row => {
      const kind = model.kindOf(row);
      if (kind === model.KIND_WORK) return `<ul class="feed" id="feed" aria-label="Fil d'activité">${feedHtml(row)}</ul>`;
      let text = awaitingOf(row) || (kind === model.KIND_DONE ? 'A fini son tour.' : 'Regarde où en est cette conversation.');
      if (kind === model.KIND_STUCK) text = row.status === 'blocked' ? (row.park && row.park.reason ? row.park.reason : 'Bloquée, sans raison') : 'S\'est arrêtée sur une erreur.';
      return `<p class="body-s clamp">${esc(text)}</p>`;
    };

    const primaryOf = row => {
      const primary = (act, label, glyph) => `<button type="button" class="ep-btn ep-btn--primary" data-act="${act}">${label} ${icon(glyph)}</button>`;
      if (row.status === 'blocked' && isServer) return primary('unpark', 'Reprendre', 'arrow');
      if (model.kindOf(row) === model.KIND_WAIT && ctx.canReply(row)) return primary('reply', 'Répondre', 'arrow');
      if (openUrlOf(row)) return primary('open', 'Ouvrir', 'open');
      return ctx.canReply(row) ? primary('to-order', 'Envoyer un ordre', 'arrow') : '';
    };

    const threadHtml = row => {
      const thread = (row.summary && row.summary.thread) || [];
      if (thread.length === 0) return '';
      const toggle = `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="exact" aria-expanded="${S.exact}">${S.exact ? 'Masquer la réponse exacte' : 'Voir la réponse exacte'}</button>`;
      if (!S.exact) return toggle;
      const bubbles = thread.slice(-2).map(message => `<div class="is-bubble ${message.role === 'user' ? 'user' : 'assistant'}">${markdown(message.text)}</div>`).join('');
      return `${toggle}<div class="is-thread" tabindex="0" aria-label="Derniers messages">${bubbles}</div>`;
    };

    const detailsToolsOf = row => [
      isServer ? smallButton('summarize', 'Rafraîchir', 'refresh') : '',
      isServer && row.cwd ? smallButton('terminal', 'Terminal', 'terminal') : '',
      isServer && model.kindOf(row) === model.KIND_WAIT ? smallButton('seen', 'Mettre au repos', 'eye') : '',
      isServer && !row.isCurrent && row.status !== 'blocked' ? smallButton('park', 'Plus tard', 'later', 'data-kind="later"') + smallButton('park', 'Bloquée', 'block', 'data-kind="blocked"') : '',
    ].join('');

    const detailsHtml = row => {
      const summary = row.summary && !row.summary.isLoading ? (row.summary.plain || row.summary.text || '') : '';
      const plain = summary ? `<div class="is-plain" tabindex="0" aria-label="Résumé">${markdown(summary)}</div>` : '<p class="ep-hint">Pas encore de résumé. « Rafraîchir » le demande.</p>';
      return `<div class="col">${plain}</div><div class="col">${threadHtml(row)}<div class="ep-cluster">${detailsToolsOf(row)}</div></div>`;
    };

    const metaLine = row => `<span class="caption-s" data-age="${row.updatedAt}">${esc(ageOf(row.updatedAt))}</span>`;

    const renderDetails = row => {
      const box = $('#details');
      const step = diffStepOf(row);
      // In cards, "Agrandir" enlarges the top card itself, as in the cockpit window: the details and a step's diff
      // fill the card (#cardMore), never a block under the deck.
      if (ctx.cards) {
        box.hidden = true;
        box.innerHTML = '';
        const isBig = Boolean((S.details || step) && row);
        ctx.islandEl.classList.toggle('is-card-big', isBig);
        const more = $('#cardMore');
        more.hidden = !isBig;
        more.innerHTML = isBig ? (step ? diffHtml(step) : detailsHtml(row)) : '';
        return;
      }
      box.hidden = !((S.details || step) && row);
      box.innerHTML = step ? diffHtml(step) : (S.details && row ? detailsHtml(row) : '');
    };

    const renderHomeText = () => {
      const row = ctx.focus();
      const target = $('#homeText');
      renderDetails(row);
      // If server is stale, show update notice instead of normal content
      const stale = root.CockpitIsland && root.CockpitIsland.staleNoticeOf ? root.CockpitIsland.staleNoticeOf() : null;
      if (stale) {
        target.innerHTML = `<div class="is-update" role="alert"><h2 class="h4">${stale}</h2><p class="body-s">L'&icirc;le attend le nouveau serveur. Red&eacute;marre Claude Desktop pour charger la version r&eacute;cente du cockpit.</p></div>`;
        return;
      }
      if (!row) {
        target.innerHTML = '<h2 class="h4">Personne au travail</h2><p class="body-s">Aucune conversation ne bouge pour l\'instant. Lance-en une depuis l\'onglet « Nouvelle conversation ».</p>';
        return;
      }
      // In cards, the top card follows the cockpit card face: state and age on the top line, then the title and
      // the request; "Agrandir" (the details) sits in the foot of the card, next to the turn-over button.
      if (ctx.cards) {
        target.innerHTML = `<div class="is-meta is-head">${tagHtml(row)}${metaLine(row)}</div><h2 class="h4">${esc(row.title)}</h2>${bodyOf(row)}<div class="is-acts">${primaryOf(row)}</div>`;
        return;
      }
      const isPermissionOrExternal = row.status === 'permission' || row.status === 'external';
      const toggle = isPermissionOrExternal ? '' : `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="details" aria-expanded="${S.details}" aria-controls="details">Détails</button>`;
      target.innerHTML = `<h2 class="h4">${esc(row.title)}</h2><div class="is-meta">${tagHtml(row)}${metaLine(row)}</div>${bodyOf(row)}<div class="is-acts">${primaryOf(row)}${toggle}</div>`;
    };

    const pillHtml = row => `<a href="#" class="ep-side-link is-head" data-pick="${esc(row.engineId)}">${headHtml(row, 24)}<span class="pn">${esc(row.title)}</span>${tagHtml(row)}</a>`;

    const renderPills = () => {
      const focusRow = ctx.focus();
      const all = model.othersOf(ctx.rows(), focusRow ? focusRow.engineId : null, 99);
      const more = all.length > OTHERS_SHOWN ? `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="cockpit">+${all.length - OTHERS_SHOWN} dans le cockpit</button>` : '';
      const empty = all.length === 0 ? '<p class="caption-s">Aucune autre conversation.</p>' : '';
      setHtml($('#homePills'), `<p class="ep-side-title">Autres conversations</p>${all.slice(0, OTHERS_SHOWN).map(pillHtml).join('')}${empty}${more}`);
    };

    const railHtml = () => {
      const focusRow = heroRowFor(S.view);
      return model.othersOf(ctx.rows(), focusRow ? focusRow.engineId : null, RAIL_SHOWN).map(row => {
        const label = `${row.title} : ${model.signalOf(row).word}`;
        return `<button type="button" class="ep-btn ep-btn--ghost ep-btn--icon is-head" data-pick="${esc(row.engineId)}" ${tipOf(label)}>${headHtml(row, 28)}</button>`;
      }).join('');
    };

    const renderCompact = () => {
      const row = ctx.urgent();
      const sig = $('#cSig');
      const button = $('#compactBtn');
      if (!row) {
        sig.className = 'ep-tag';
        setHtml(sig, 'Personne au travail');
        setHtml($('#cOthers'), '');
        button.setAttribute('aria-label', 'Ouvrir l\'île : personne au travail');
        return;
      }
      const word = model.compactWordOf(ctx.rows());
      // Side by side, a small hand of cards per state, fanned, each with only its count: what waits (amber), what is
      // on a mission, what is blocked. No sentence. With no hand at all, the urgent conversation's picto alone.
      const sorted = model.byUrgency(ctx.rows());
      const hands = [
        { tone: 'wait', label: ['t\'attend', 't\'attendent'], rows: sorted.filter(model.isWaiting) },
        { tone: 'work', label: ['en mission', 'en mission'], rows: sorted.filter(other => !model.isWaiting(other) && model.kindOf(other) === model.KIND_WORK) },
        { tone: 'stuck', label: ['bloquée', 'bloquées'], rows: sorted.filter(other => model.kindOf(other) === model.KIND_STUCK) },
      ].filter(hand => hand.rows.length > 0);
      if (hands.length > 0) {
        sig.className = 'c-hands';
        setHtml(sig, hands.map(hand => `<span class="c-hand c-${hand.tone}" aria-hidden="true">${hand.rows.slice(0, HAND_SHOWN).map(other => headHtml(other, 22)).join('')}<span class="c-count">${hand.rows.length}</span></span>`).join(''));
      } else {
        const tag = tagOf(row);
        sig.className = tag.cls;
        setHtml(sig, tag.lead);
      }
      setHtml($('#cOthers'), '');
      const summary = hands.map(hand => `${hand.rows.length} ${hand.label[hand.rows.length > 1 ? 1 : 0]}`).join(', ');
      button.setAttribute('aria-label', `Ouvrir l'île : ${row.title}, ${summary || word}`);
    };

    const kindLabelOf = row => {
      if (row.status === 'permission') return 'demande d\'autorisation';
      if (row.status === 'external') return 'attend autre chose';
      return 'question de Claude';
    };

    const cannotReplyNote = row => {
      if (!row) return 'Rien à qui parler pour l\'instant.';
      if (row.status === 'permission') return 'Cette demande d\'autorisation se traite dans Claude : l\'île ne peut pas la valider à ta place.';
      if (row.isCurrent) return 'C\'est la conversation qui fait tourner ce cockpit : réponds-lui directement dans l\'app.';
      return 'Répondre demande la version servie du cockpit.';
    };

    // Une autorisation que l'app tient : la commande et les trois décisions, à la place du champ de réponse. Les boutons
    // s'arment 600 ms après l'arrivée d'une nouvelle demande (S.permShownAt), pour qu'un clic égaré ne l'autorise pas.
    const renderPermission = (row, ask) => {
      $('#wPerm').hidden = ask === null;
      if (ask === null) return;
      if (S.permId !== ask.requestId) { S.permId = ask.requestId; S.permShownAt = Date.now(); }
      $('#wKind').textContent = `${ask.tool} · demande d'autorisation`;
      $('#wQuote').textContent = ask.summary || 'Claude demande à continuer.';
      $('#wCmd').textContent = ask.detail || ask.summary;
      $('#wAlways').hidden = !ask.canAlways;
      $('#wHold').textContent = model.holdNoteOf(ask.deadlineAt, Date.now());
    };

    const renderWait = () => {
      // En cartes, le formulaire est sur la carte du dessus : il suit la conversation visée quand elle t'attend.
      const focus = ctx.focus();
      const row = ctx.cards && focus && model.kindOf(focus) === model.KIND_WAIT ? focus : (ctx.waiting()[0] || ctx.focus());
      if (!row) return;
      const ask = model.permissionOf(S.permissions, row.engineId);
      const can = ctx.canReply(row);
      const url = openUrlOf(row);
      $('#wName').textContent = row.title;
      $('#wKind').textContent = kindLabelOf(row);
      $('#wQuote').textContent = awaitingOf(row) || 'Regarde où en est cette conversation.';
      renderPermission(row, ask);
      $('#replyForm').hidden = !can;
      const replies = can ? quickRepliesOf(row) : [];
      $('#wQuick').hidden = replies.length === 0;
      $('#wQuick').innerHTML = replies.map(reply => `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="quick" data-engine="${esc(row.engineId)}" data-text="${esc(reply.text)}">${esc(reply.label)}</button>`).join('');
      $('#wNote').hidden = can || ask !== null;
      $('#wNote').textContent = cannotReplyNote(row);
      $('#wOpen').hidden = can || ask !== null || !url;
      $('#wOpen').innerHTML = url ? `<button type="button" class="ep-btn ep-btn--primary" data-act="open">Ouvrir dans Claude ${icon('open')}</button>` : '';
      $$('[data-rail]', layerEl('wait')).forEach(rail => setHtml(rail, railHtml()));
    };

    const renderOrder = () => {
      const row = ctx.focus();
      const can = ctx.canReply(row);
      $('#oName').textContent = row ? row.title : 'Aucune conversation';
      $('#oSig').hidden = !row;
      if (row) setTag($('#oSig'), row);
      $('#orderForm').hidden = !can;
      $('#oNote').hidden = can;
      $('#oNote').textContent = cannotReplyNote(row);
    };

    const renderPark = () => {
      const row = ctx.focus();
      const info = PARK_KINDS[S.parkKind];
      $('#pName').textContent = row ? row.title : '';
      $('#pTitle').textContent = info.title;
      $('#parkOk').textContent = info.ok;
      $('#parkChips').innerHTML = info.chips.map(chip => `<button type="button" class="ep-btn ep-btn--sm" data-act="park-chip" data-reason="${esc(chip)}">${esc(chip)}</button>`).join('');
    };

    const folderItemHtml = folder => `<label class="is-item ep-check"><input type="checkbox" value="${esc(folder)}" ${S.picked.includes(folder) ? 'checked' : ''}><span class="is-item-text"><span class="is-name">${esc(folderOf(folder))}</span><span class="is-path">${esc(folder)}</span></span></label>`;

    const renderNewList = () => {
      const needle = $('#newSearch').value.trim().toLowerCase();
      const list = S.folders.filter(folder => folder.toLowerCase().includes(needle)).slice(0, FOLDER_LIST_MAX);
      $('#newList').innerHTML = list.length === 0 ? '<span class="caption-s">Aucun dépôt connu</span>' : list.map(folderItemHtml).join('');
      $('#newPicked').innerHTML = S.picked.map((folder, index) => `<span class="ep-tag ${index === 0 ? 'ep-tag--accent' : ''}">${index === 0 ? 'Principal · ' : ''}${esc(folderOf(folder))}</span>`).join('');
    };

    const renderOrderThumbs = () => {
      $('#orderThumbs').innerHTML = S.images.map((image, index) => `<div class="is-thumb"><img src="${esc(image.url)}" alt=""><button type="button" class="ep-btn ep-btn--ghost ep-btn--icon ep-btn--sm" data-act="rm-image" data-index="${index}" aria-label="Retirer l'image">${icon('x')}</button></div>`).join('');
    };

    const ageTick = () => {
      const row = ctx.focus();
      const ask = model.permissionOf(S.permissions, S.permId === null ? '' : (S.permissions.find(entry => entry.requestId === S.permId) || {}).engineId);
      if (ask !== null && !$('#wPerm').hidden) $('#wHold').textContent = model.holdNoteOf(ask.deadlineAt, Date.now());
      for (const el of $$('[data-age]')) el.textContent = ageOf(Number(el.dataset.age), Date.now());
    };

    return {
      activityLabel, canvasHtml, heroRowFor, renderCompact, renderHomeText, renderPills, renderWait, renderOrder, renderPark,
      renderNewList, renderOrderThumbs, ageTick,
    };
  };

  const api = { createViews, PARK_KINDS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandViews = api;
})(typeof window !== 'undefined' ? window : globalThis);
