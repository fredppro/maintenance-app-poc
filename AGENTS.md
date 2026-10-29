<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project guidance

- Use the Node.js version and pnpm version pinned in `.node-version` and
  `package.json`; prefer the repository's `pnpm` scripts.
- For Next.js changes, consult the installed version's guides under
  `node_modules/next/dist/docs/`.
- Preserve PostgreSQL migration history, tenant scoping, and row-level
  security. Do not use `prisma db push` for production changes.
- Keep credentials and secret values out of source, logs, chat, and
  documentation. Do not inspect local secret files unless explicitly
  authorized.
- Do not change live infrastructure, provider settings, or production data
  without explicit operator authorization.
- Treat `docs/reference/environment-status.md` as the repository-evidence ledger, not a
  live dashboard. Preserve dated observations and label plans, historical
  reports, and unverified external state rather than guessing.
- Run the narrowest relevant checks; use `pnpm lint`, `pnpm typecheck`,
  `pnpm test:run`, and `pnpm build` as applicable.
