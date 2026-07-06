# Deployment

Master Mold can run locally without credentials.

```bash
bun install
bun run build
bun run dev
```

For a production-like local run:

```bash
npm run build
npm run start
```

`npm run start` requires Node 22.5 or newer because the autopilot store uses
the built-in `node:sqlite` driver. Local development and smoke checks can run
under Bun, which uses `bun:sqlite`.

## Environment

Create `.env.local` from `.env.example` and fill only the values you need.

```bash
cp .env.example .env.local
```

Keep real values out of git. User-specific stores should stay under `.data/`
or another ignored local path.
