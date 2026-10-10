(function (root) {
  'use strict';

  const MAX_SUGGESTIONS = 8;
  const HIDDEN_STATUSES = ['closed', 'archived'];

  const byRecency = (first, second) => second.updatedAt - first.updatedAt;

  const suggestionsOf = (rows, waitingStatuses) => {
    const visible = rows.filter(row => !HIDDEN_STATUSES.includes(row.status));
    const waiting = visible.filter(row => waitingStatuses.includes(row.status));
    const others = visible.filter(row => !waitingStatuses.includes(row.status));
    const sortedWaiting = [...waiting].sort(byRecency);
    const sortedOthers = [...others].sort(byRecency);
    return [...sortedWaiting, ...sortedOthers].slice(0, MAX_SUGGESTIONS);
  };

  const moveSelection = (index, delta, count) => {
    if (count === 0) return -1;
    const start = index < 0 ? -1 : index;
    return Math.min(count - 1, Math.max(0, start + delta));
  };

  const api = { MAX_SUGGESTIONS, suggestionsOf, moveSelection };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitDock = api;
})(typeof window !== 'undefined' ? window : globalThis);
