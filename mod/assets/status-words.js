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

  const api = { WAITING_STATUSES, WAIT_KINDS, PARK_WORDS, SECTION_TITLES, isWaiting, waitKindOf, waitRankOf, waitingCountOf, waitingPhraseOf };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitStatusWords = api;
})(typeof window !== 'undefined' ? window : globalThis);
