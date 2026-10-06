# Design: Quiet instrument

Master Mold should feel like a precise instrument at night: graphite surfaces,
one magenta signal, numbers first. The app holds money, research, and a
trading bot, so the interface stays calm and lets state colors carry meaning.

## Principles

1. **Graphite, with one signal.** Neutrals are near-neutral graphite
   (`surface-*`, `outline-*` in `tailwind.config.ts`). Magenta is reserved for
   the primary action on a screen, focus rings, the active nav item, and the
   Sentinel. Selected states in segmented controls, filters, and pickers use a
   raised graphite chip (`bg-surface-highest`), not a pink fill.
2. **Numbers lead, labels whisper.** Figures use the display face with tabular
   numerals (`mm-num`). Labels use `mm-eyebrow`: sentence case, body face,
   muted. Avoid uppercase tracked monospace labels; mono is for tickers, code,
   and figures only.
3. **Color means state.** Green is live or up, amber needs you, red is stop,
   loss, or error, gray is off. An expected idle state (bot off, daemon
   offline while mode is off) is gray, never red. A zero change is neutral.
4. **Flat depth.** One panel style (`mm-panel`): hairline border, subtle
   gradient, no glow. Elevation comes from surface steps. Primary buttons get
   a crisp top highlight instead of a halo.
5. **One obvious place to ask.** The top bar ask box is the entry point on
   desktop; the floating Sentinel stays face-only in the page margin so it
   never covers content.
6. **Truth over polish.** Sample data, locked live trading, and missing keys
   are always labeled where they appear. `/review` stays the full account.

## Checking a change

Run the app on a throwaway store (see `scripts/e2e-server.mjs` for the
environment variables), then look at desktop (1440 wide) and phone (iPhone 13)
widths. A change is done when it reads as one app on both, nothing overflows
sideways, and no fixed control covers content.
