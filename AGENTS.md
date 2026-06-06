# RDS Next.js Build Notes

- Keep this as a Next.js App Router project.
- Preserve `/api/health`; RDS uses it for local and public health checks.
- Prefer server components by default; use `"use client"` only for interactive components.
- Generated product work should replace the starter UI, not the stack plumbing.
- Preserve and update `components/review-readiness.tsx` until the product has a
  better app-visible truthfulness surface. It must say what works, what is
  seeded/sample, what is stubbed or credential-gated, what is missing, and how
  review credentials work.
