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
- The hosted Zo services run from `/root/mastermold`; the visible clean GitHub
  checkout is `/home/workspace/Projects/mastermold`. Preserve runtime state and
  reconcile local production-only commits deliberately when updating either.
