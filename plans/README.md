# Animation plans

Written by `improve-animations` on commit c996d6e, from a frame-by-frame screen recording of the island on Windows.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Glass window that morphs, content window that never resizes](001-island-glass-and-content-windows.md) | HIGH | DONE, review pending |
| 002 | [Keyboard open without animation, immediate focus](002-keyboard-open-no-animation.md) | HIGH | DONE, review pending |
| 003 | [Deck card transition within budget, shared springs](003-pile-duration-and-shared-springs.md) | LOW | DONE, review pending |

## Order

1. **001** first: it changes how the island moves; 002 and 003 build on its geometry message.
2. **002**: needs the instant flag to reach the page geometry (001).
3. **003**: the shared springs part needs 001; the CSS duration can go anytime.

## Follow-ups from the first /review-animations

- Reduced motion keeps a 150 ms opacity fade, no movement and no scale (`REDUCED_FADE_MS`, `mod/assets/island-motion.js`).
- The shrink lead of the clip is two measured display frames (`SHRINK_LEAD_FRAMES`), 40 ms until measured.
- The page no longer draws its own 1 px edge on the glass when the island is two windows (Windows draws it).
