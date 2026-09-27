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

Phone (`e2e/phone.e2e.ts`): no sideways scroll on /transactions or /budget,
and tapping opens the importer and builds a budget.

## Bugs this found

- The Budget "Add a category" dropdowns were wrapped inside their labels, so
  their accessible names included every option. They now use explicit
  `htmlFor`/`id` labels (caught by `getByLabel("Category", { exact: true })`).
- Earlier "clicks don't register" reports came from the agent's in-app browser
  tool, not the app: real Playwright mouse clicks work on every control above.

## Last run

2026-09-27: 10 passed (8 desktop, 2 phone), 17 s.

