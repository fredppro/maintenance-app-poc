# Deployment and release

Repository deployment and release behavior. CI image publication is not proof of deployment; consult the [environment status record](../reference/environment-status.md) for unresolved live state.

## CI and container image release

GitHub Actions runs the unit and browser suites on pull requests and pushes to
`main` or `develop`. After both pass, it builds the production [Dockerfile](../../Dockerfile)
and scans the image for high and critical vulnerabilities. Pull requests do not
publish images; successful branch pushes publish an immutable commit-tagged image
to GHCR and expose its digest.

The GHCR package must be kept private. The `deploy-staging` job is restricted to successful pushes to
`develop`; it pins the Coolify application to that run's image digest and
verifies `/api/health` reports the same commit revision. Older runs skip
deployment if a newer commit is already at the head of `develop`.

The job is disabled until the `staging` GitHub Environment secrets and the
repository Actions variable `STAGING_AUTODEPLOY_ENABLED` are configured. Until then,
publishing an image does not deploy it. It does not deploy production. On
2026-10-30, a one-time manual Coolify deployment of image digest
`sha256:c712ad154402609445cd2912aa6131084f1dd34a97e94626d408675326186cd6`
reported a completed rolling update, and the staging login page loaded after
refresh. The active runtime digest was not independently exposed at that time.
On 2026-10-31, workflow run 24 deployed image digest
`sha256:b95c781cc3793026cc95fca8ebfd9a4dfdc3678cbb3bde5396cc24a35bdf1152`;
Coolify reported success and `/api/health` returned the matching commit in
`X-Application-Revision`. This verifies one end-to-end staging deployment, not
production behavior. See [the environment status record](../reference/environment-status.md)
for the evidence and remaining verification.

## Enable automated staging deployment

Complete the external network and credential setup before enabling the job:

1. Apply and verify the Ansible `staging-firewall` tag before provisioning the
   dedicated peer. It narrows VPN SSH to the operator peer, blocks the staging
   peer from host services, and restricts its Docker-forwarded traffic to TCP
   `8000`. Then provision the dedicated WireGuard peer after confirming its
   address is unused. Its client route must be limited to `10.242.0.1/32`; do
   not reuse the operator Mac peer. UFW alone may not filter Docker-published
   ports, so verify the `DOCKER-USER` policy as well.
2. Enable Coolify API access and allowlist only the dedicated peer address.
   Create a token with `write` and `deploy` permissions, without `root` or
   `read:sensitive`. This token applies to resources in its Coolify team; the
   token owner must remain a team administrator.
3. In the GitHub repository's `staging` Environment, add these secrets:
   - `STAGING_WIREGUARD_CONFIG`: the dedicated peer's client configuration.
   - `COOLIFY_API_TOKEN`: the least-privilege token described above.
4. Restrict the `staging` Environment to the `develop` branch. Then set the
   repository Actions variable `STAGING_AUTODEPLOY_ENABLED` to `true`.

The workflow targets the existing staging application UUID in
`.github/workflows/tests.yml` and the private Coolify URL `http://10.242.0.1:8000`.
It updates the repository image name and `sha256-<hex>` tag together; Coolify
resolves that tag to the immutable digest reference. Keep `@sha256` out of the
image-name field, or Coolify will construct an invalid doubled digest reference.
Do not put WireGuard private keys or API tokens in the repository. The image
build embeds its commit SHA in the successful `/api/health` response header
`X-Application-Revision`, allowing the workflow to distinguish the new
container from an older container that may still serve during a rolling
update.

The workflow confirms Coolify returned a deployment UUID, then waits for a
healthy response carrying the expected commit SHA. It does not read deployment
logs or automatically roll back. If a deployment fails or times out, inspect
Coolify and `/api/health`; the configured image tag may already have changed
while the prior container is still serving. If rollback is needed, restore the
previous `sha256-<digest>` image tag in Coolify and redeploy it.

## Production and staging operations

The repository does not provision production/staging resources or configure
provider-managed database backups, secret storage, monitoring, or alerting.
Before a pilot, verify that an isolated staging environment exists and is
healthy; use distinct database URLs and auth secrets per environment, set the
production HTTPS origin, configure Resend, exercise the backup restore
procedure, and run migrations only after a reviewed backup. Readiness is
available at `/api/health`.
See the [pilot-readiness guide](../planning/pilot-readiness.md) for the
operational procedure and known limitations. Row-level security and tenant
isolation are described in the [tenant-isolation guide](../architecture/tenant-isolation.md).
## CI

`.github/workflows/tests.yml` runs on pull requests and pushes to `main` and
`develop`. Its standard job uses the Node.js version in `.node-version` and
pnpm 12.9.1 and runs, in order:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm build`
5. `pnpm test:coverage`

Coverage is uploaded as the `vitest-coverage` artifact for 14 days. The
separate browser job provisions its own PostgreSQL 17 service, applies
migrations, installs Chromium, and runs the Playwright suite without a hosted
database secret.
