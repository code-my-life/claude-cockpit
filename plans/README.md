# Animation plans

Written by `improve-animations` on commit c996d6e, from a frame-by-frame screen recording of the island on Windows.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Glass window that morphs, content window that never resizes](001-island-glass-and-content-windows.md) | HIGH | DONE, review pending |
| 002 | [Keyboard open without animation, immediate focus](002-keyboard-open-no-animation.md) | HIGH | TODO |
| 003 | [Deck card transition within budget, shared springs](003-pile-duration-and-shared-springs.md) | LOW | TODO |

## Order

1. **001** first: it changes how the island moves; 002 and 003 build on its geometry message.
2. **002**: needs the instant flag to reach the page geometry (001).
3. **003**: the shared springs part needs 001; the CSS duration can go anytime.
