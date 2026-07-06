# Security

## Secret Handling

Do not commit secrets. Use ignored local files:

- `.env.local` for the app.
- `engine/.env` for the Python engine.

Keep `.env.example` files placeholder-only.

## Runtime Boundaries

- Portfolio imports are read-only.
- The advisory lane must not place brokerage orders.
- Wallet authority must not be stored in the repository.
- Any real-money operation must require explicit local configuration and
  independent review.

## Reporting Issues

If you find a secret or personal data in tracked files, rotate the credential if
needed and remove the material from both the current tree and public history
before making the repository public.
