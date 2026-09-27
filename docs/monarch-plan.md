# Monarch-style money hub: prioritized plan

Order is by dependency first, then value. Every step works without a bank
connection (CSV import and hand entry), so Plaid slots in later as one more
source. See [monarch-research.md](monarch-research.md).

| # | Item | Why first | Done when |
|---|---|---|---|
| 1 | **Transaction store + category tree** | Every planning feature sums transactions | Transactions persist in all store backends; default Type → Group → Category tree |
| 2 | **Rules engine** | Categorization is the daily chore Monarch removes | Ordered if/then rules (merchant / original text / amount / account → rename, category, hide, review); applied on import; preview + apply to past |
| 3 | **Transactions page + CSV import + hand entry** | Makes 1–2 usable | Import a bank CSV with preview; search, filter, recategorize inline; "make this a rule" |
| 4 | **Cash flow** | First payoff screen | Monthly income, expenses, savings, savings rate; transfers, card payments, hidden excluded |
| 5 | **Recurring bills** | Surfaces subscriptions and due dates | Detect repeating merchants; month view with upcoming / paid / changed / missed |
| 6 | **Budgets with rollovers** | Planning on top of cash flow | Fixed / Non-monthly / Flex; rollover formula incl. the Flex exception |
| 7 | **Goals** | Motivation layer | Target, date, account, linked transactions, monthly pace |
| 8 | **Account exclusions + investment performance** | Parity polish | Per-account exclude switches; time-range gain/loss |
| 9 | **Live sync (Plaid, then SimpleFIN fallback)** | Removes manual imports | Needs Chris's Plaid account. Read-only tokens in `.env.local`/`.data` only; daily sync |

## Implementation status

- [x] 1. Transaction store + category tree
- [x] 2. Rules engine
- [x] 3. Transactions page with CSV import and hand entry
- [x] 4. Cash flow (on the Transactions page)
- [ ] 5. Recurring bills
- [ ] 6–9

