# 002 — Open the island from the keyboard without animation, focus at once

- **Status**: DONE (awaiting /review-animations)
- **Commit**: c996d6e
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 2 files, small

## Problem

The global shortcuts (`Control+Alt+I` toggle, `Control+Alt+R` go to what waits, `desktop/island-shortcuts.js:5-9`) open
the island with the same 300 ms spring as a click, then wait another 200 ms before focusing:

```js
// mod/assets/island-ui.js:253 — current
if (name === 'toggle') { openWith('home', 'click'); focusSoon('home'); return; }
// mod/assets/island-ui.js:9 — current
const FOCUS_DELAY_MS = 200;
// mod/assets/island-ui.js:240 — current
const focusSoon = view => win.setTimeout(() => focusFirst(view), ctx.reduceQuery.matches ? 0 : FOCUS_DELAY_MS);
```

A keyboard-initiated action never animates: the user is waiting to type.

## Target

- A shortcut opens the island with no morph (glass jumps to its target, content shows at once) and focuses the first
  field immediately (0 ms).
- Click and hover keep the spring.

## Repo conventions to follow

- `go(phase, view, { silent })` in `mod/assets/island-ui.js` already snaps without motion when `silent` is true
  (`ctx.motion.snap(target)`); the controller jumps when its spring `ms` is 0 (`desktop/island/controller.js`, `spring()`).

## Steps

1. `mod/assets/island-ui.js`: add `by: 'key'` for shortcut opens (`openWith(view, 'key')` in the shortcut handler at line 253
   and its siblings for `waiting`, `next`, `previous`); in `go()`, treat `S.by === 'key'` like `silent` (snap).
2. Send the opening with an instant flag: `desktop.setExpanded(true, w, h, false, false, true)` (new 6th argument `isInstant`)
   in `pushExtent` when `S.by === 'key'`; `desktop/preload.js` forwards it; `desktop/main.js` passes it to
   `island.setExpanded(…, { isInstant })`; `desktop/island/controller.js` uses `ms: 0` for that placement.
3. Replace `focusSoon(view)` by `focusFirst(view)` for shortcut opens (no timeout).

## Boundaries

- Do NOT change click or hover behaviour, nor the springs.
- If plan 001 is done first, the instant flag must also reach the page geometry message (`ms: 0`).

## Verification

- **Mechanical**: root `npm test`, desktop `node --test`, e2e on Windows.
- **Feel check**: press `Control+Alt+I` (installed app, shortcuts are off in e2e): the island is open on the next frame and
  the caret is already in the field; typing right away loses no character.
- **Done when**: a shortcut open shows no morph frame and the first keystroke lands in the field.
