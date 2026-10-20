# 001 — Split the island into a glass window that morphs and a content window that never resizes

- **Status**: DONE (awaiting /review-animations)
- **Commit**: c996d6e
- **Severity**: HIGH
- **Category**: Performance (with Physicality & origin, Easing & duration)
- **Estimated scope**: 5 files (desktop/main.js, desktop/island/controller.js, desktop/preload.js, mod/assets/island-motion.js, mod/assets/island.css), plus tests; large

## Problem

The island's shape is its native window, resized every 8 ms by a spring:

```js
// desktop/island/controller.js:11 — current
const FRAME_MS = 8
// desktop/main.js:177 — current
applyBounds: bounds => { if (win !== null) win.setBounds(bounds); /* … */ },
```

```js
// desktop/island/morph.js:61-69 — current (inside step())
const k = ease(progress)
const width = Math.max(1, Math.round(from.width + (target.width - from.width) * k))
const height = Math.max(1, Math.round(from.height + (target.height - from.height) * k))
current = { x: Math.round(centerX - width / 2), y: Math.round(from.y + (target.y - from.y) * k), width, height }
emit(current)
```

The same window holds the page (the island content) and the Windows acrylic. While the window is resized frame
after frame, Windows presents no new frame of the page. Measured on a screen recording of the real app
(Windows, real GPU), frame by frame:

- Opening: the glass grows empty from 2.80 s to 3.03 s, then the whole open content appears at once at 3.07 s.
  It reads as "a window appears, then the island pops in it", not as an island growing.
- Closing: the open content stays and is cropped from the top-left corner as the window shrinks (6.53 to 6.60 s),
  then the folded island appears in a frame larger than itself, off-centre, before the frame tightens (6.63 to 6.73 s).

Page-side fades (`mod/assets/island-motion.js:7-21`) cannot help: the page is simply not shown during the resize.
Tried and rejected: keeping the window at its final size and animating `win.setShape()`; the acrylic ignores the
window shape (the whole rectangle stays glass).

## Target

Two windows, both always on top, both centred on the work area top edge:

1. **Glass window** (new, `glassWin`): no page (`about:blank`), the acrylic (`applyBlur`, island tint), `focusable: false`,
   `setIgnoreMouseEvents(true)`, `skipTaskbar`, `alwaysOnTop` level `'floating'`. It is the only window that morphs:
   the existing controller/morph drive `glassWin.setBounds()` exactly as today (same springs: open `{ ms: 300, zeta: 0.72 }`,
   close `{ ms: 260, zeta: 0.9 }`). With nothing to repaint, this already animates smoothly (seen on the recording).
2. **Content window** (the existing `win`): `transparent: true`, `backgroundColor: '#00000000'`, no `applyBlur`,
   `hasShadow: false`, owned by the glass window (`parent: glassWin`, so it always stays above it). Its bounds are
   fixed: the work area minus `SCREEN_MARGIN` on the left and right, full work area height
   (`{ x: area.x + SCREEN_MARGIN, y: area.y, width: area.width - 2 * SCREEN_MARGIN, height: area.height }`).
   It is never resized during a transition, so the page never lags behind a resize. It is click-through outside the
   island: `win.setIgnoreMouseEvents(true, { forward: true })` by default; `false` while the pointer is over the island
   (the page already reports it: `desktop.islandPointer(isInside)`, `mod/assets/island.js:94`).
3. **The page draws the shape in sync with the glass.** For every morph the main process sends the page
   `island-geometry` with `{ from, to, ms, zeta, startedAt }`: `from`/`to` are the glass rectangles expressed in the
   content window's coordinates, `startedAt` is `Date.now()` at the start of the glass morph, `ms`/`zeta` the spring used.
   The page:
   - sizes and places `.island` (`position: fixed`) to the union of `from` and `to` (the larger box) at the start, so its
     content is laid out once, at its final size, before anything shows;
   - animates `clip-path: inset(top right bottom left round 0)` from `from` to `to` with the same spring function
     (`model.springEase({ zeta, ms }, ms)`, already in `mod/assets/island-model.js`), driven by
     `progress = (Date.now() - startedAt) / ms` in `requestAnimationFrame`, so page and glass share one clock;
   - at the end, sets `.island` to exactly `to` and removes the clip.
4. **Content motion** (inside the clip), using the curve `cubic-bezier(0.23, 1, 0.32, 1)` (strong ease-out):
   - incoming layer: `opacity` 0 → 1 and `transform: scale(0.96)` → `scale(1)`, `transform-origin: 50% 0`, 200 ms, starting
     with the morph (no delay);
   - outgoing layer: `opacity` 1 → 0 and `scale(1)` → `scale(0.96)`, 150 ms, starting with the morph.
   These replace `FADE_IN_MS`, `FADE_OUT_MS`, `CONTENT_DELAY_MS`, `GROW_FROM` in `mod/assets/island-motion.js`.
5. **Reduced motion** (`prefers-reduced-motion: reduce`, already `ctx.motion.speed() === 0` and the controller's
   `hasReducedMotion`): `ms` is 0; the page jumps to `to` with no clip animation; opacity changes still apply instantly.

## Repo conventions to follow

- Pure, injectable modules under `desktop/island/` (no Electron import), tested with `node --test`: imitate
  `desktop/island/morph.js` and its `morph.test.js`.
- Main-process wiring lives in `desktop/main.js` (`createIsland`, `createWindow`); IPC from the page goes through
  `onTrusted(...)` handlers and `desktop/preload.js` (`contextBridge`), e.g. `onTrusted('island-pointer', …)` at
  `desktop/main.js:467` and `islandPointer` in the preload.
- Page motion lives in `mod/assets/island-motion.js` (`createMotion`), layout only in `mod/assets/island.css`
  (header comment: "CSS local = géométrie seulement").
- Comments and identifiers in English; UI text in French.

## Steps

1. `desktop/main.js`, `createWindow`: create `glassWin` first with the options of Target 1; call
   `hasIslandBlur = applyBlur(glassWin, undefined, undefined, ISLAND_TINTS[islandTheme])` on it instead of `win`.
   Create `win` with `transparent: true`, `backgroundColor: '#00000000'`, `parent: glassWin`, `hasShadow: false`, and keep
   every other existing option. Do not call `applyBlur` on `win`.
2. `desktop/main.js`, `setIslandTheme` (line 139): apply the tint to `glassWin` (not `win`); still send `island-theme` to `win`.
3. `desktop/main.js`, `backdropLuminance` (line 149): read `glassWin.getBounds()` (the island shape), not `win.getBounds()`.
4. `desktop/main.js`, `createIsland`: `applyBounds` sets `glassWin.setBounds(bounds)`; `setVisible` shows/hides both windows
   (`showInactive` both, glass first). Add a `contentBoundsOf(area)` helper (Target 2) and set `win` to it at creation, on
   `screen` `display-metrics-changed` and on `display-added`/`display-removed`.
5. `desktop/island/morph.js`: add an optional `onStart({ from, to, ms, zeta, startedAt })` injected callback, called once at
   the start of `to()` with the from/target bounds (screen coordinates) and `startedAt = now()`; call it from `jump()` too
   with `ms: 0`. Cover it in `morph.test.js`.
6. `desktop/island/controller.js`: accept a `sendGeometry` injected function; wire `morph`'s `onStart` to it. In
   `desktop/main.js`, implement it: convert both rectangles to content-window coordinates (subtract `win.getBounds()`
   x/y) and `win.webContents.send('island-geometry', { from, to, ms, zeta, startedAt })`.
7. `desktop/preload.js`: expose `onIslandGeometry(callback)`; add `setIslandCapture(isInside)` sending `island-capture`.
   In `desktop/main.js`: `onTrusted('island-capture', (event, isInside) => win?.setIgnoreMouseEvents(isInside !== true, { forward: true }))`,
   and call `win.setIgnoreMouseEvents(true, { forward: true })` after creation. In `mod/assets/island.js:94`, also call
   `desktop.setIslandCapture(isInside)` in the pointer reporter.
8. `mod/assets/island-motion.js`: add `geometry(message)` implementing Target 3 (place `.island`, rAF clip-path driven by
   `Date.now()`), and replace the layer fades with Target 4 (constants: `FADE_IN_MS = 200`, `FADE_OUT_MS = 150`,
   `CONTENT_DELAY_MS = 0`, `GROW_FROM = 0.96`, fade ease = `cubic-bezier(0.23, 1, 0.32, 1)`). Remove the two-frame deferral
   of `pushExtent` in `mod/assets/island-ui.js` (`go()`), which only existed to work around the resize lag.
   In `mod/assets/island.js`, subscribe `desktop.onIslandGeometry(message => ctx.motion.geometry(message))`.
9. `mod/assets/island.css`: `.island` keeps `position: fixed` but drops `inset: 0`; its `left/top/width/height` and
   `clip-path` are set by the script. `html.island-mode, html.island-mode body` stay `background: transparent`.
10. Without a desktop bridge (web page, `?island=1` in a browser): keep today's behaviour (`.island { inset: 0 }`), i.e.
    apply step 9 only when `html.os-glass` or a new `html.island-split` class set by `island.js` when
    `desktop.onIslandGeometry` exists.

## Boundaries

- Do NOT change the island FSM (`desktop/island/fsm.js`), the springs' values, the island content or its views.
- Do NOT touch the launcher or the cockpit windows.
- Do NOT add dependencies.
- If `transparent: true` with an owned window breaks `alwaysOnTop` or focus on Windows, STOP and report (do not improvise
  another window architecture).
- If a step does not match the code (drift since c996d6e), STOP and report.

## Verification

- **Mechanical**: `npm test` (root) and `cd desktop && node --test *.test.js island/*.test.js` all pass; `npm run typecheck:mod` clean;
  full e2e on Windows: `cd desktop && npx playwright test -c test/playwright.config.ts` passes (the reference run).
- **Feel check** (Windows, real GPU, real desktop behind):
  - Record the screen while opening by click, by hover and closing; step frame by frame. Every frame of the morph shows
    content inside the glass; no frame shows an empty glass box; no frame shows the folded island in a corner.
  - The content grows from the top centre with the glass, never from a corner.
  - Closing: the content shrinks toward the top centre with the glass; the folded hands never appear inside a larger box.
  - Clicks anywhere outside the island reach the window behind it; hovering the folded island still opens it.
  - With "Animation effects" off in Windows (reduced motion), open/close jump with no movement.
- **Done when**: the frame-by-frame recording of open and close shows no empty glass frame and no off-centre content,
  and the Windows e2e suite passes.

## Execution notes

- Step 8 alone did not show content during the morph: the page froze for about 300 ms on opening (two long tasks of
  136 and 105 ms). Cause: each render rewrote the folded hands, the pills and the rail, moving 12 mini `<sg-card>`
  out of the page and back; each one then restarts (canvas, text texture through `getImageData`, WebGPU pipeline).
  Fixed in `mod/assets/island-views.js` (`setHtml`: a block is rewritten only when its markup changed). After it: no
  long task and no frame gap on opening.
- Windows paints the page about two frames after it moves the glass. Growing, this keeps the content inside the glass;
  shrinking, it left content outside it, so the clip runs 40 ms ahead when the shape shrinks (`SHRINK_LEAD_MS`).
- `setShape()` on the content window was not needed; tried on the single window first, the acrylic ignores it.
- e2e harness: removing the test folder now retries asynchronously (`removeRootSoon`); `rmSync`'s own retries blocked
  the test process while the two island windows let go of the folder.
