# Monarch Money: how it behaves, and what Master Mold would need

Researched 2026-09-27 from Monarch's public help center and site. Nothing here
used an account. Where a claim is not from a cited page it is marked
**unverified**.

## The shape of the product

Monarch is five surfaces on one data feed: a dashboard, **Transactions**,
**Accounts** (net worth), **Investments**, and planning (**Budgets / Cash flow /
Recurring / Goals**). The feed is the hard part; the screens are the easy part.
Everything except net worth and investments sits on one object: a stored,
categorized **transaction**.

## Accounts and sync

- Net worth across all assets and liabilities sits at the top of the Accounts
  page; each account opens for detail
  ([Investments in Monarch](https://help.monarch.com/hc/en-us/articles/41855507661076-Investments-in-Monarch)).
- Each account can be excluded independently from the account list, net
  worth, cash flow, or budgets
  ([Hiding an account](https://help.monarchmoney.com/hc/en-us/articles/4407859794580-Hiding-an-account)).
- Forecasting projects net worth separately from the live chart
  ([Forecasting](https://help.monarch.com/hc/en-us/articles/48344305092244-Forecasting-in-Monarch)).
- Sync goes through Plaid, MX, or Finicity; a failing connection can switch
  provider, fall back to a manual account, or use CSV import
  ([Getting Started](https://help.monarchmoney.com/hc/en-us/articles/360048393272-Getting-Started-Guide);
  [Connection statuses](https://help.monarchmoney.com/hc/en-us/articles/13227606293908)).
- Accounts refresh about every 24 hours in the cloud; Settings → Institutions →
  Refresh All forces an update
  ([Monarch blog](https://partners.monarchmoney.com/blog/force-refresh-accounts-multi-factor-authentication)).
  Target for Master Mold: a daily sync plus a manual refresh button.

## Transactions, categories and rules

- Categories are three levels: **Type → Group → Category**. Custom groups and
  categories can be added, hidden, and reordered
  ([Getting Started](https://help.monarchmoney.com/hc/en-us/articles/360048393272-Getting-Started-Guide);
  [Budgets](https://help.monarchmoney.com/hc/en-us/articles/360048883631-Budgets)).
- A transaction can be reviewed, edited, categorized, tagged, hidden,
  deleted, split, entered by hand, or imported
  ([Manual transactions](https://help.monarchmoney.com/hc/en-us/articles/360058441811-Manual-transactions)).
- Hidden transactions stay in history but leave budget and cash-flow totals
  ([Hide transactions](https://help.monarchmoney.com/hc/en-us/articles/4405041904916-Hide-Transactions)).
- **Rules** run on new, non-pending transactions
  ([Transaction rules](https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules)):
  - *If*: merchant (exact or contains), cleaned merchant or original statement
    text, amount (equals / above / below / range; income or expense),
    category, account.
  - *Then*: rename merchant, set category, add tags, hide, set review status,
    link to a goal, or split.
  - Rules run top to bottom, so specific rules go above broad ones. Rules can
    be previewed, applied to past transactions, and created from a manual edit.
  - Automatic splits require an exact-amount condition and split by dollars or
    percent ([Splitting](https://help.monarch.com/hc/en-us/articles/360050178492-Splitting-Transactions)).
- Monarch applies its own auto-categorization first, then user rules
  ([Budgets](https://help.monarchmoney.com/hc/en-us/articles/360048883631-Budgets)).

## Budgets

- Three groups: **Fixed** (rent, insurance, subscriptions), **Non-monthly**
  (annual insurance, property tax, gifts, travel), **Flex** (day-to-day; watched
  as one total) ([Budgets](https://help.monarchmoney.com/hc/en-us/articles/360048883631-Budgets)).
- **Rollovers**: next month starts with previous rollover + this month's plan −
  this month's spend (e.g. $50 carried + $100 plan − $75 spent = $75). Suggested
  for non-monthly costs; usually off for fixed. In Flex a rollover changes only
  that category, never the Flex total. A rollover can have a starting balance
  ([Rollovers](https://help.monarchmoney.com/hc/en-us/articles/4411119762196-Rollover-budget-feature)).

## Recurring bills

- A monthly calendar/list of expected bills: upcoming, paid, paid at a
  different amount, missed
  ([Recurring](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills)).
- Added by hand (amount, frequency, date, account, category) or suggested by
  scanning transactions; can be marked "not recurring".
- US cards and loans can sync statement balance and due date through Spinwheel
  and auto-mark paid; utilities and subscriptions stay as recurring merchants
  ([Bill Sync](https://help.monarch.com/hc/en-us/articles/29446697869076-Getting-started-with-bill-syncing)).
  It tracks only; it never pays.

## Cash flow

- Savings = income − expenses; savings rate = savings ÷ income. Transfers
  between your own accounts, credit-card payments, hidden transactions, and
  excluded accounts are left out
  ([Budgets](https://help.monarchmoney.com/hc/en-us/articles/360048883631-Budgets)).

## Goals

- Name, target amount, optional date, the account holding the money, a
  starting balance; Monarch estimates the monthly saving needed
  ([Getting Started](https://help.monarchmoney.com/hc/en-us/articles/360048393272-Getting-Started-Guide)).
- Contributions are linked transactions; a rule can link them but must include
  an account condition
  ([Rules](https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules)).
- Goals track; they never move or reserve money.

## Investments

- Holdings and a Performance view with a time range and filters by account,
  security, and asset class; gain/loss where the brokerage supplies data.
  Incomplete brokerage data makes historical performance unreliable. Manual
  holdings cover what a feed misses and do not change a synced balance
  ([Manual holdings](https://help.monarchmoney.com/hc/en-us/articles/10032888165140-Manual-investment-holdings)).

## Reports and overall UX

- Reports: spending by category, merchant, or account, plus an income → spending
  Sankey, with date ranges, filters, and click-through to the underlying
  transactions ([Tracking and reports](https://www.monarchmoney.com/features/tracking)).
  CSV-imported rows count as long as expenses are negative
  ([CSV import](https://help.monarchmoney.com/hc/en-us/articles/4409682789908-Import-data-manually-from-banks-or-other-finance-apps)).
- Overall UX pattern visible across the pages above: one review queue for new
  transactions, edits that can become rules, and planning views that are pure
  sums over categorized transactions.

## How Master Mold can replicate it

| Monarch | Master Mold today | Gap |
|---|---|---|
| Accounts, net worth | Built on Portfolio (accounts, debts, history) | Per-account "exclude from net worth / cash flow / budgets" |
| Investments | Holdings, allocation, price refresh | Time-range performance and per-holding gain/loss |
| Transactions + categories + rules | Missing | The foundation (see plan) |
| Cash flow | Missing | Sum over transactions with transfer/hidden exclusions |
| Recurring | Missing | Detect repeating merchants; calendar states |
| Budgets + rollovers | Missing | Fixed / Non-monthly / Flex with the rollover formula |
| Goals | Missing | Target, date, account, linked transactions |
| Live sync | Manual/CSV only | A read-only aggregator. Plaid Trial is free for up to 10 live connections; SimpleFIN Bridge ~$1.50/month. On hold until Chris creates an account |

Master Mold stays read-only throughout: no provider can move money, and every
provider credential lives only in git-ignored local config.

