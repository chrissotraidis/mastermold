# Browser tests (Playwright)

`npm run e2e` builds the app and runs `e2e/*.e2e.ts` in Chromium against a
production server on port 4012 (`scripts/e2e-server.mjs`). Every data store
points at a fresh temp folder and all model keys are blank, so a run never
touches `.data/`, never calls a provider, and never spends anything. The first
run may need `npx playwright install chromium` (a free browser download).

Clicks are real mouse clicks (desktop, 1280×900) and real taps (Pixel 7). File
upload goes through the actual `<input type="file">`.

## What the suite verifies

Transactions (`e2e/transactions.e2e.ts`):

- Empty state → Import CSV → choose a file → preview says "6 new" → Import →
  toast → cash flow shows $5,000 income and $191.09 spending (the $1,000
  transfer is excluded).
- Importing the same file again previews "0 new · 6 already imported" and the
  Import button is disabled.
- Pasting a CSV, importing, then Undo in the toast removes the whole batch.
- Inline category change, hide (spending drops to $184.59), delete, and all
  three survive a reload (spending $168.60).
- Make a rule from a row: edit the match, preview says "1 match now", save,
  the toast says it applied to 1 past transaction, and the rule is listed.
- Add a cash transaction by hand with a chosen category.

Budget (`e2e/budget.e2e.ts`):

- Empty state says "set a budget first" instead of showing a fake overspend.
- Start from my spending builds Fixed and Flex groups from the last three
  months; editing Groceries to $500 recalculates "$70.00 left"; rollover
  toggles on; removing Restaurants moves it to "Not in the budget", and
  "Budget it" puts it back; the edited plan survives a reload.
- The Add a category form adds Gifts to Non-monthly.

Goals (`e2e/goals.e2e.ts`): create a goal with a starting balance, link a
transfer from the suggestions, edit the target, and delete it.

Accounts (`e2e/accounts.e2e.ts`): add a bank account with Net worth unticked;
it is listed with "Not in net worth" and the total does not move; ticking it
again adds exactly its balance.

Sandbox sync (`e2e/sandbox-sync.e2e.ts`): Run sandbox sync adds 5 rows marked
Sandbox (the pending charge and the removed charge never appear); running it
again adds 0; Undo in the toast removes the batch.

Phone (`e2e/phone.e2e.ts`): no sideways scroll on /transactions, /budget or
/portfolio; tapping opens the importer, builds a budget, and switches the net
worth range.

## Bugs this found

- The Budget "Add a category" dropdowns were wrapped inside their labels, so
  their accessible names included every option. They now use explicit
  `htmlFor`/`id` labels (caught by `getByLabel("Category", { exact: true })`).
- Earlier "clicks don't register" reports came from the agent's in-app browser
  tool, not the app: real Playwright mouse clicks work on every control above.
- Browsers that expose WebGL but cannot create a context (headless Chromium,
  some locked-down devices) threw a three.js error on every page and showed a
  blank avatar. The face now probes WebGL once and keeps the static face.
- The Portfolio net worth tile cut its value off ("$67,2…") and the allocation
  legend squeezed its labels to nothing; both fixed.
- Intermittent: right after a page loads, React briefly keeps the streamed page
  in a hidden `div#S:n` before swapping it in, so strict locators saw every
  element twice. `e2e/app-test.ts` makes `page.goto` wait for the swap; all
  specs import `test` from it.
- The Budget "Add a category" picker shrank to "Choc…" once a plan was on the
  page; it now keeps a minimum width.
- Transaction rows cut merchant names to three letters ("Am…") on desktop; the
  date column moved under the name and the category picker narrowed.
- The unit tests left one temp folder per test behind (35,000 folders, 2 GB,
  enough to fill this Mac's disk). Each run now uses one folder that is removed
  at the end, and the e2e server clears earlier runs' folders on start.
- Settings status tiles cut their values ("Sample d…", "Saved 2026-…") and the
  Monarch buttons overlapped the "Monarch MCP" title; actions now sit under the
  text and the header wraps. Groceries and dining no longer count as bills.
- A fixed bill paid exactly on plan showed a yellow warning bar and "$0.00
  left"; it now reads "paid" in green. Budget month pills scroll on phones.
- Re-check pass: a unit contract test still pinned the old Monarch header
  classes (missed because only the last line of test output was read); fixed,
  and the pass/fail counts are now checked explicitly.
- A new holding did not appear after "Add holding" until a manual reload (and
  edits and undo were stale the same way). Next bundles pages and API routes
  separately in production, so each had its own 5-second portfolio cache and
  the API's invalidation never reached the page. The cache now lives on
  globalThis. Caught by the new `e2e/holdings.e2e.ts` (add, gain, edit + undo,
  remove + undo).
- Importing a manual_holdings book into an empty portfolio offered no Undo
  (undo was only shown when there were earlier rows). Whole-book imports are now
  always undoable. The header chip also said "Showing sample data. Add holdings…"
  after holdings existed; it describes the market read and now says so. Caught
  by `e2e/import-book.e2e.ts`.
- Crawl of all 18 routes on desktop and phone (seeded data): no console errors,
  page errors, failed requests, sideways scroll, or clipped short labels.
  Journal logging, Chat without a key, and every Settings tab also ran clean.
  `e2e/welcome.e2e.ts` now covers the first visit.

## Last run

2026-09-28: 32 passed (25 desktop, 7 phone), 49 s.

## iPhone and iPad simulators (2026-09-27)

Checked in Safari on the iPhone 17 Pro and iPad Air 11-inch (M4) simulators
(iOS/iPadOS 26.5), loading the dev server at 127.0.0.1:4002. These stand in for
the physical devices, which were not available.

- The 3D sentinel head renders with real WebGL on both; the first dev-mode load
  takes about 20 seconds while three.js compiles, with the static face shown
  until then.
- Welcome → "Look around with sample data first" dismisses onboarding on both.
- Transactions, Budget and Portfolio lay out without sideways scroll. The iPad
  uses the icon rail; the iPhone uses the bottom tab bar.
- Fixed from this pass: Budget had no tab on phones (the Spending tab now covers
  Transactions and Budget, and Transactions has a Budget button), and the
  Portfolio "Net worth" label was cut off to "NET WOR…" by its sparkline.
- Not bugs: a freshly booted simulator showed a blank Safari page once until a
  reload, and Device Hub taps land about 70 px above the aimed point, which
  sent two taps to the Welcome page's "Log your first call" step.

## Mobile pass (2026-09-28)

- Phone tab bar: Today, Portfolio, Spending (Transactions + Budget), Labs (both
  labs), and More, a sheet with every destination grouped as Money, Research labs,
  and Master Mold. Journal, Budget, Chat and Settings were unreachable from the
  old bar. The dev "N" badge no longer covers the first tab.
- Hide amounts (eye button in the top bar) blurs every figure; the choice stays
  on the device across reloads.
- Page intros are desktop-only; phones show the eyebrow and title. Today's
  checklist is one row per step, Refresh is an icon, Settings status is a 2x3
  grid, tabs fade at the edge when they scroll, and the labs have a
  Web3 | Polymarket switch.
- Tests: `e2e/phone.e2e.ts` covers More, the lab switch, and Hide amounts.
