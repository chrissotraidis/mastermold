# Available Skills

This project was scaffolded with the following RDS skills resolved and installed.
**You must use these skills as your defaults.** Do not reinvent functionality these
skills provide. Full per-skill manifests live in `.rds/skills/<slug>.json`.

When a skill applies to your current task, follow its conventions instead of
improvising. Examples:
- If `shadcn-add` is present, use shadcn/ui components from `@/components/ui/*`
  instead of writing raw HTML form controls or ad-hoc Tailwind components.
- If `auth-better-auth` is present, use Better Auth's session APIs instead of
  rolling a custom auth flow.
- If `drizzle-introspect-skill` is present, use Drizzle ORM for schema and
  queries instead of raw SQL or another ORM.
- If `playwright-mcp` is present, write UI verification with Playwright.

Skill usage is mandatory when relevant:
1. Read this file before choosing an implementation pattern for UI, auth,
   data, testing, browser verification, canvas/game quality, secrets, or evals.
2. Apply any resolved skill whose purpose matches the task.
3. In each final task note, state `Skills used:` with the skill slug(s), or
   `Skills not applicable:` with a short reason.
4. If an applicable skill cannot be used because required files, packages,
   credentials, or tools are missing, report that blocker instead of inventing
   an ad-hoc substitute.

## Skills

### `playwright-mcp` — Playwright MCP
- **Category:** testing
- **Install mode:** imperative
- **Purpose:** Adds the RDS browser verification contract for real preview interaction.
- **Why it's here:** RDS needs a browser-level verifier for claims about UI behavior. This skill requires opening the generated preview, clicking through core flows, checking console output, and saving evidence.
- **References:** [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp), [Playwright](https://playwright.dev/)
- **Manifest:** `.rds/skills/playwright-mcp.json`

### `rds-context7-mount` — Context7 documentation mount
- **Category:** ai-context
- **Install mode:** metadata
- **Purpose:** Pins current framework documentation requirements into the build manifest so agents know which docs to mount.
- **Why it's here:** Default RDS skill because framework version drift is one of the highest-risk causes of bad generated code. It records the documentation context expected for the selected stack.
- **References:** [context7.com](https://context7.com/), [github.com/upstash/context7](https://github.com/upstash/context7)
- **Manifest:** `.rds/skills/rds-context7-mount.json`

### `rds-eval-harness` — RDS eval harness
- **Category:** verification
- **Install mode:** metadata
- **Purpose:** Records regression/eval fixture expectations for agentic or LLM-backed builds.
- **Why it's here:** Default eval-capable skill for agentic builds because LLM features need regression fixtures, not only visual smoke checks.
- **References:** [Ragas evals](https://docs.ragas.io/)
- **Manifest:** `.rds/skills/rds-eval-harness.json`

### `rds-mockup-fidelity` — RDS mockup fidelity
- **Category:** verification
- **Install mode:** metadata
- **Purpose:** Runs the stack-specific mockup analog verifier and writes a diff report under builds/<id>/mockup-diff.
- **Why it's here:** Default RDS skill because visual output must be compared against the intended mockup or analog before claiming the preview is done.
- **References:** [playwright.dev](https://playwright.dev/)
- **Manifest:** `.rds/skills/rds-mockup-fidelity.json`

### `rds-secrets-broker` — RDS secrets broker
- **Category:** security
- **Install mode:** metadata
- **Purpose:** Records secret requirements without copying or exposing actual secret values.
- **Why it's here:** Default RDS skill for all stacks because any generated app can introduce credentials, analytics keys, OAuth, webhooks, or deploy secrets, and generated apps must not hardcode or expose secret values.
- **References:** [zo.computer docs](https://docs.zocomputer.com/)
- **Manifest:** `.rds/skills/rds-secrets-broker.json`

### `shadcn-add` — shadcn add
- **Category:** frontend
- **Install mode:** imperative
- **Purpose:** Adds the shadcn/ui component workflow contract for polished Next.js interfaces.
- **Why it's here:** Next.js builds need a consistent component source. This skill tells RDS when to use shadcn/ui, how to avoid ad-hoc component drift, and how to verify the app still builds after components are added.
- **References:** [shadcn/ui CLI](https://ui.shadcn.com/docs/cli), [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- **Manifest:** `.rds/skills/shadcn-add.json`

## Pre-scaffolded files

These files already exist and consume the skills listed above.
**Modify them in place — do not delete or rewrite from scratch.**
They include the marker comment `// RDS prescaffold: <slug>`; keep the skill imports.

- **shadcn-add**:
  - `app/layout.tsx`
  - `app/page.tsx`
