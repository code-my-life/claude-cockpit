(function (root) {
  'use strict';

  const DOCK_SIZES = {
    small: { label: 'Petit', head: 40 },
    medium: { label: 'Moyen', head: 56 },
    large: { label: 'Grand', head: 72 },
  };
  const DOCK_LAYOUTS = { row: 'Ligne', column: 'Colonne', grid: 'Grille' };
  const DEFAULT_PREFS = { size: 'medium', layout: 'row' };
  const GRID_ROWS = 2;
  const MAX_SUGGESTIONS = 8;
  const HIDDEN_STATUSES = ['closed', 'archived'];

  const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

  const readDockPrefs = raw => {
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!isRecord(data)) return { ...DEFAULT_PREFS };
    const size = Object.hasOwn(DOCK_SIZES, data.size) ? data.size : DEFAULT_PREFS.size;
    const layout = Object.hasOwn(DOCK_LAYOUTS, data.layout) ? data.layout : DEFAULT_PREFS.layout;
    return { size, layout };
  };

  const gridColumnsOf = count => Math.max(1, Math.ceil(count / GRID_ROWS));

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

  const api = { DOCK_SIZES, DOCK_LAYOUTS, DEFAULT_PREFS, MAX_SUGGESTIONS, readDockPrefs, gridColumnsOf, suggestionsOf, moveSelection };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitDock = api;
})(typeof window !== 'undefined' ? window : globalThis);
