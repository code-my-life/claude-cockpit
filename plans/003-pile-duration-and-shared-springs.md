# 003 — Deck card transition within budget, one source for the island springs

- **Status**: TODO
- **Commit**: c996d6e
- **Severity**: LOW
- **Category**: Easing & duration, Cohesion & tokens
- **Estimated scope**: 3 files, small

## Problem

```css
/* mod/assets/island.css:66 — current */
.island .pile .conv-card { /* … */ transition: transform .4s cubic-bezier(.2,.8,.2,1), opacity .4s; }
```

A card brought forward in the deck takes 400 ms, over the 300 ms budget for UI motion.

The island springs are written twice with no shared source:

```js
// desktop/bounds.js:9-10 — current
const OPEN_SPRING = { ms: 300, zeta: 0.72 }
const CLOSE_SPRING = { ms: 260, zeta: 0.9 }
// mod/assets/island-motion.js:17-18 — current
const SPRING_OPEN = { zeta: 0.72, ms: 300 };
const SPRING_CLOSE = { zeta: 0.9, ms: 260 };
```

## Target

```css
/* target */
.island .pile .conv-card { /* … */ transition: transform 250ms cubic-bezier(0.23, 1, 0.32, 1), opacity 250ms cubic-bezier(0.23, 1, 0.32, 1); }
```

- The page reads the springs sent by the app (plan 001's `island-geometry` message carries `ms`/`zeta`); `SPRING_OPEN` and
  `SPRING_CLOSE` in `island-motion.js` remain only as the fallback without a desktop bridge, with a comment pointing to
  `desktop/bounds.js` as the source of truth.

## Steps

1. `mod/assets/island.css:66`: apply the target transition.
2. `mod/assets/island-motion.js:17-18`: comment the fallback, use the message values when present (after plan 001).

## Boundaries

- Motion values only; no markup change.

## Verification

- **Mechanical**: root `npm test`.
- **Feel check**: click a lower card of the deck: it comes forward quickly, settles without drift; in DevTools at 10 %
  playback, the move ends by 250 ms.
- **Done when**: no island UI transition exceeds 300 ms.
