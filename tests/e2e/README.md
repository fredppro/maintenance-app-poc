# Browser tests

The browser suite uses a real Next.js server and writes fixture records to a
dedicated database. Do not point it at a development or production database.

For local E2E, copy `.env.example` to `.env`, then start the isolated Compose
database and apply the committed migrations:

```sh
pnpm db:e2e:up
pnpm db:migrate:e2e
pnpm test:legacy-ownership
pnpm exec playwright install chromium
pnpm test:e2e
```

The legacy ownership integration check creates and removes isolated test
fixtures, exercises the guarded assignment and audit transaction twice to
verify idempotence, and refuses to run unless `E2E_DATABASE_URL` targets the
dedicated `_test` database. CI runs this verification before the browser suite.

`E2E_DATABASE_URL` must point at a PostgreSQL database whose name ends in
`_test`; it is read from `.env` and must identify a different host/port/database
from `DATABASE_URL`. Playwright always starts its own server and does not reuse
an existing development server.

The global setup creates an equipment and worker fixture. Teardown removes tasks
with the `E2E - Playwright` title prefix and removes those exact fixtures.

The test logs in as `playwright@example.test`; global setup creates the test
account, organization, and site in the E2E database. Playwright pins
`BETTER_AUTH_URL` to `http://127.0.0.1:3000` so auth origins match the browser
server. The E2E database must be migrated before running the suite; tests never
use the developer or production database.

GitHub Actions provisions an isolated PostgreSQL service, applies migrations,
and runs the browser suite. The standard unit-test job does not need a database
server.
