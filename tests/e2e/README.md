# Browser tests

The browser suite uses a real Next.js server and writes fixture records to a
dedicated database. Do not point it at a development or production database.

Set `E2E_DATABASE_URL` to a PostgreSQL/Neon database whose database name ends
in `_test`, with the current Prisma schema already applied, then run:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The global setup creates an equipment and worker fixture. Teardown removes tasks
with the `E2E - Playwright` title prefix and removes those exact fixtures.

GitHub Actions runs the browser job only when the repository variable
`RUN_E2E_TESTS` is `true`; configure `E2E_DATABASE_URL` as a repository secret
before enabling it. The standard unit-test job does not need a database server.
