(function (root) {
  'use strict';

  // One vocabulary for the cockpit, the island and the launcher (audit 2026-10-20, P1 n° 3): the same
  // word, icon and order for a state, and the same count of what waits for the user.
  // Pure module: no DOM. The waiting statuses follow the mod (mod/hooks/sections.mts).
  const WAITING_STATUSES = ['permission', 'done', 'external'];

  // What a waiting conversation waits for. The permission comes first everywhere.
  const WAIT_KINDS = {
    permission: { label: 'Permission', icon: 'alert', rank: 0 },
    question: { label: 'Question', icon: 'info', rank: 1 },
    unknown: { label: 'A fini', icon: 'check', rank: 2 },
    delivered: { label: 'Mission livrée', icon: 'check', rank: 3 },
    external: { label: 'Attend autre chose', icon: 'later', rank: 4 },
  };

  const PARK_WORDS = {
    blocked: { label: 'Bloquée', icon: 'block' },
    later: { label: 'Plus tard', icon: 'later' },
  };

  const SECTION_TITLES = { waiting: 'T\'attendent', working: 'En mission', parked: 'Mis de côté', stuck: 'Bloquées', later: 'Plus tard' };

  const isWaiting = row => WAITING_STATUSES.includes(row.status);

  const waitKindOf = row => {
    if (row.status === 'permission') return 'permission';
    if (row.status === 'external') return 'external';
    const kind = row.summary && row.summary.kind;
    if (kind === 'question' || kind === 'delivered') return kind;
    return 'unknown';
  };

  const waitRankOf = row => WAIT_KINDS[waitKindOf(row)].rank;

  const waitingCountOf = rows => rows.filter(isWaiting).length;

  // "1 conversation t'attend", "3 conversations t'attendent".
  const waitingPhraseOf = (count, noun = true) => {
    const plural = count > 1;
    return `${count}${noun ? ` conversation${plural ? 's' : ''}` : ''} t'attend${plural ? 'ent' : ''}`;
  };

  // Quick replies (audit 2026-10-20, P1 n° 8). A question answers with its own options when the summary
  // numbers them ("1. …", "2. …"); a question without options gets no quick reply, only the reply field;
  // anything else keeps OK, GO, Non. A button sends the option number, as one would type it.
  const QUICK_REPLIES = ['OK', 'GO', 'Non'];
  const OPTION_LABEL_MAX = 40;
  const optionsOf = text => {
    const options = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const match = /^\s*(\d+)[.)]\s+(.+?)\s*$/.exec(line);
      if (!match || Number(match[1]) !== options.length + 1) continue;
      const label = match[2].replace(/\*\*|__|`/g, '').trim();
      options.push({ label: label.length > OPTION_LABEL_MAX ? `${label.slice(0, OPTION_LABEL_MAX - 1).trimEnd()}…` : label, text: match[1] });
    }
    return options.length >= 2 && options.length <= 6 ? options : [];
  };
  const quickRepliesOf = row => {
    if (waitKindOf(row) !== 'question') return QUICK_REPLIES.map(text => ({ label: text, text }));
    return optionsOf(row.summary && row.summary.text).map(option => ({ label: `${option.text}. ${option.label}`, text: option.text }));
  };
  const REPLY_PLACEHOLDER = 'Réponds à Claude…';

  const api = { WAITING_STATUSES, WAIT_KINDS, PARK_WORDS, SECTION_TITLES, QUICK_REPLIES, REPLY_PLACEHOLDER, isWaiting, waitKindOf, waitRankOf, waitingCountOf, waitingPhraseOf, optionsOf, quickRepliesOf };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitStatusWords = api;
})(typeof window !== 'undefined' ? window : globalThis);
