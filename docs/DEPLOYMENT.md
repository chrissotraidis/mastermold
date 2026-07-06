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

## Environment

Create `.env.local` from `.env.example` and fill only the values you need.

```bash
cp .env.example .env.local
```

Keep real values out of git. User-specific stores should stay under `.data/`
or another ignored local path.
