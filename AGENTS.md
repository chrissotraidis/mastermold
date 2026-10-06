# RDS Next.js Build Notes

- Keep this as a Next.js App Router project.
- Preserve `/api/health`; RDS uses it for local and public health checks.
- Prefer server components by default; use `"use client"` only for interactive components.
- Generated product work should replace the starter UI, not the stack plumbing.
- Use `app/review/page.tsx` as the app-visible truthfulness surface. It must
  say what works, what is seeded/sample, what is stubbed or credential-gated,
  what is missing, and how review credentials work.

## Public Repository Safety

- This is a public repository: `https://github.com/chrissotraidis/mastermold`.
- Never commit or push secrets, API keys, passwords, wallet keys or seed
  phrases, private financial/account data, imported holdings, live databases,
  `.env*` files, host logs, backups, or private model/training artifacts.
- Keep Zo runtime state such as `/root/mastermold/.data`, `.env.local`,
  `engine/.env`, and ignored `engine/out` artifacts local. Use sanitized
  fixtures and redacted examples in tracked files.
- Before every commit or push, inspect the staged diff, run the privacy audit,
  and verify ignored runtime files were not force-added. Treat any uncertainty
  as a reason to stop before publishing.
- Runtime state lives at `/root/mastermold`; the visible clean GitHub checkout
  is `/home/workspace/Projects/mastermold`. Preserve `/root/mastermold/.data`
  and reconcile local production-only commits deliberately when updating either.
- Zo services `mastermold-web` and `mastermold` were unhosted 2026-09-11.
  Do not re-register or restart them unless Chris explicitly asks.

## Operating posture (2026-09-11)

- Hosted website and process services are unhosted. Runtime databases remain
  on disk at `/root/mastermold/.data` and must not be deleted.
- Automated paper execution is parked: `POLYMARKET_WALLET_FOLLOW=0`, Polymarket
  paper mode `off`, Autopilot mode `off`, all five paper experiments paused.
- Do not re-arm paper, follow-arm, Autopilot paper, or experiments unless Chris
  explicitly asks. Live execution stays locked.
- Analyst / wallet-shadow / brain / weather are not collecting while the
  process service is unhosted. Close-out numbers live in the private session
  log, not this public repo.

## LLM Providers

- Every non-streaming call goes through `src/llm/completion.ts`. Do not add a
  new `fetch` to a provider URL; add the call site to that module instead.
- Primary is **OpenCode Go** (`deepseek-v4-flash`, flat-rate, same key
  ApplyPilot uses, read from `OPENCODE_GO_API_KEY`). OpenRouter is the metered
  fallback and is only reached when the primary fails.
- `OPENROUTER_MODEL` is still honored for the fallback, because every call site
  before 2026-08-24 read it directly.
- The OpenRouter attribution header is `X-Title`. `X-OpenRouter-Title` does not
  exist; sending it is why this app's spend was invisible in the dashboard for
  months. `tests/llm-provider-chain.test.ts` pins this.
- `POLYMARKET_ANALYST_MODEL` is deliberately unset. Its old value carried
  OpenRouter's `:online` web-search plugin, billed on top of tokens. Measured
  over 779 resolved forecasts that search made the analyst *worse* than the
  market prior (Brier 0.2289 vs 0.2066; its high-confidence calls scored
  0.2526 vs 0.1790). Do not re-enable `:online` without new evidence.
- Consequence to know before "fixing" it: without web search the analyst has no
  live information, so it stays near the market prior at `low` confidence — and
  `decideAnalystBet` never bets on low. The lane grades and calibrates; it does
  not currently place bets.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
