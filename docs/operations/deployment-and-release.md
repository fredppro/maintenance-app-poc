# Deployment and release

Repository deployment and release behavior. For the supported topology, see
[deployment architecture](deployment-architecture.md). CI image publication
is not proof of deployment; consult the
[environment status record](../reference/environment-status.md) for unresolved
live state.

## CI and container image release

GitHub Actions runs unit, browser, image-build, and image-scan checks on pull
requests targeting `main` or `develop`. Pushing commits to an open PR reruns
those checks. The `Security` workflow also checks PRs and pushes to `main`.
Successful PR validation builds and scans the production and migration images,
then stores them as a 30-day workflow artifact; it does not publish PR images
to GHCR.

When a PR is merged to `develop`, the resulting push starts the separate
[`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml) workflow
under `refs/heads/develop`, matching the staging Environment's branch
restriction. It locates the successful `Tests` and `Security` runs for the
merged PR's exact head, downloads the tested images, verifies the artifact
metadata and source-tree hash against the merged commit, then promotes those
images to GHCR. It does not rerun tests, rebuild the images, or rescan them.
Deployment fails closed if validation or the artifact is missing,
unsuccessful, expired, or does not match the merged tree. If another PR has
already advanced `develop`, the older deployment is skipped so it cannot roll
staging back.

The workflow pins the Coolify Compose source to the merged commit and updates
the application and migrator image tags to the validated images. The staging
Compose definition makes the app depend on successful completion of the
migrator. Every deployment runs `prisma migrate deploy`; it applies any pending
committed migrations and succeeds without changes when there are none. A
migration failure prevents the new application container from starting.

After triggering Coolify, a separate `wait-for-coolify` job polls the
deployment UUID over WireGuard for up to 15 minutes with bounded exponential
backoff. Coolify must report a finished deployment before the workflow
proceeds. The `COOLIFY_API_TOKEN` therefore needs Coolify's `read` permission
in addition to `write` and `deploy`; do not grant `read:sensitive` or `root`.
A separate `verify-staging` job then requires two consecutive HTTP 200 health
responses reporting the validated revision, with a three-minute deadline.
Either waiting or health verification can be rerun without redeploying or
rerunning migrations. Staging deploys remain serialized through verification.

The GHCR package must be kept private. Staging deployment also requires the
`staging` GitHub Environment secrets and the repository Actions variable
`STAGING_AUTODEPLOY_ENABLED=true`. The workflow does not deploy production.
On 2026-10-30, a one-time manual Coolify deployment of image
digest
`sha256:c712ad154402609445cd2912aa6131084f1dd34a97e94626d408675326186cd6`
reported a completed rolling update, and the staging login page loaded after
refresh. The active runtime digest was not independently exposed at that time.
On 2026-10-31, workflow run 24 deployed image digest
`sha256:b95c781cc3793026cc95fca8ebfd9a4dfdc3678cbb3bde5396cc24a35bdf1152`;
Coolify reported success and `/api/health` returned the matching commit in
`X-Application-Revision`. This verifies one end-to-end staging deployment, not
production behavior. On 2026-11-06, PR #18's post-merge workflow run #34 also
succeeded; staging returned HTTP 200 with
`X-Application-Revision: 6a1b8bd48cb7452eaee6cfb826cd7efb6ffa7a2c`, and Coolify
reported the app as `Running`. That confirms the previous push-to-`develop`
flow, not the new PR-artifact promotion workflow. See
[the environment status record](../reference/environment-status.md) for the
evidence and remaining verification.

## Database migration image

The workflow builds and scans a separate `migrator` image alongside the
application image, and promotes that validated image to GHCR with the release.
Its entrypoint runs `prisma migrate deploy`, provisions the restricted runtime
role, and verifies that role. The image needs the target environment's
`MIGRATION_DATABASE_URL` and `DATABASE_URL`; keep the owner credential out of
the application runtime. In staging Compose, only the `migrator` service
receives `MIGRATION_DATABASE_URL`; the `app` service receives the restricted
`DATABASE_URL`.

Treat migrations as forward-only deployment steps. Prefer additive,
backward-compatible expand/contract changes so the old app can continue serving
while migrations run. A migration failure aborts the Compose rollout. An app
failure after a successful migration does not roll the database back; keep the
schema compatible with the previous app release or use a separately reviewed
database recovery plan.

The existing standalone `maintenance-staging-migrator` Coolify Docker Image
resource is not used as the deployment gate. Coolify v4.6 can mark that
resource's deployment finished when container launch succeeds, without proving
the one-shot process exited successfully. See the [Coolify v4.6 deployment
implementation](https://github.com/coollabsio/coolify/blob/v4.6.0/app/Jobs/ApplicationDeploymentJob.php).
Keep the existing resource until the Compose replacement is configured and has
completed a verified staging deployment; then retire it deliberately.

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
   Create a token with `read`, `write`, and `deploy` permissions, without
   `root` or `read:sensitive`, and limit its resource access to the staging
   Compose application. The token owner must remain a team administrator.
3. In the GitHub repository's `staging` Environment, add these secrets:
   - `STAGING_WIREGUARD_CONFIG`: the dedicated peer's client configuration.
   - `COOLIFY_API_TOKEN`: the least-privilege token described above.
4. Create a new staging Coolify application as **Docker Compose from Git**
   (Coolify's Docker Image application type does not switch deployment methods
   in place). Connect this repository, select a branch containing
   `docker-compose.staging.yml` (the PR branch while preparing the change, or
   `develop` after it is merged), and select that Compose file. The deploy
   workflow pins the source to `develop` and the merged commit. Keep the
   existing app available as a rollback resource while setting up the
   replacement.
5. Configure the new Compose resource to use the existing external Docker
   network `coolify`; route the staging domain to service `app` on port `3000`.
   Configure GHCR pull access and copy the existing staging application
   environment values to the new resource. Set `MIGRATION_DATABASE_URL` to
   the migration owner URL and `DATABASE_URL` to the restricted runtime URL.
   The Compose file passes the owner URL only to `migrator`. Keep both URLs in
   Coolify, not in GitHub Actions. Initialize `APP_IMAGE_TAG` and
   `MIGRATOR_IMAGE_TAG` with the currently deployed image tags so Coolify can
   validate and manually test the Compose resource; the workflow replaces
   these values with the validated immutable tags on each deployment.
6. Set the GitHub `staging` Environment variable `STAGING_COOLIFY_APP_UUID` to
   the new Compose application UUID. Keep the existing app and domain in place
   while testing the replacement with a temporary hostname or internal
   healthcheck. If that is unavailable, coordinate the cutover after Coolify
   reports the Compose deployment successful and the replacement as running:
   move the staging domain to the new `app` service on port `3000`, then stop
   (but do not delete) the old app. The deploy workflow checks the canonical
   staging URL, so this route must point to the Compose app for its revision
   check to pass. Set `STAGING_COMPOSE_MIGRATION_ENABLED=true` before merging
   the PR that enables its post-merge deployment.
7. Restrict the `staging` Environment to the `develop` branch. The deployment
   workflow runs on the post-merge `develop` push (not the PR merge ref), so
   this restriction can remain enabled. A required
   reviewer on that Environment pauses each deployment; leave that setting
   unset for a fully automatic merge-to-staging flow, or retain it only if
   manual approval is intentional. Protect `develop` with pull-request review
   requirements and require the PR checks `Tests / unit`, `Tests / browser`,
   `Tests / container-image`, `Security / secrets`, and
   `Security / dependencies`. Also enable required Code Owner review for
   workflow, script, and Dockerfile changes. The checked-in
   [CODEOWNERS](../../.github/CODEOWNERS) file routes those changes to `@fredppro`.
   Keep both deployment secrets environment-scoped; do not create repository-level
   copies. Only then set the repository Actions variable
   `STAGING_AUTODEPLOY_ENABLED` to `true`. Retain the old image app and standalone
   migrator until the Compose workflow has completed a successful deployment
   and the new staging app has passed its smoke checks; retire them separately.
   Keep the old migrator stopped and unrouted during cutover. Coolify displayed
   an auto-generated `sslip.io` domain for it despite no exposed ports; remove
   that domain when retiring the resource.

The workflow's `staging` environment is an approval boundary only when required
reviewers are configured in GitHub repository settings. A branch restriction
alone does not require approval.

The workflow targets the staging Compose application UUID from
`STAGING_COOLIFY_APP_UUID` and the private Coolify URL
`http://10.242.0.1:8000`. It pins the Compose checkout to the merged commit and
updates `APP_IMAGE_TAG` and `MIGRATOR_IMAGE_TAG` to the validated
`sha256-<hex>` tags. Do not put `@sha256` in either tag variable.
Do not put WireGuard private keys or API tokens in the repository. The image
build embeds its validated source SHA in the successful `/api/health` response header
`X-Application-Revision`, allowing the workflow to distinguish the new
container from an older container that may still serve during a rolling
update.

The runtime image in this repository declares a Docker health check that calls
`http://127.0.0.1:3000/api/health`; Coolify can report the container as healthy
only after an image containing this check is deployed. The PR #18 deployment
was observed to change Coolify from `Running (no healthcheck)` to `Running`;
the currently active image has not been rechecked for this workflow change.

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

[`tests.yml`](../../.github/workflows/tests.yml) and
[`security.yml`](../../.github/workflows/security.yml) validate pull requests
to `main` and `develop`. Tests also run on pushes to `main`; neither workflow
runs again on a merge push to `develop`. Tests include documentation-link
checks, lint, type-check, build, unit/coverage tests, PostgreSQL-backed
integration tests, Playwright browser tests, and app/migrator image scans.
Coverage is uploaded as `vitest-coverage` for 14 days; validated images are
retained for 30 days.

The staging workflow runs on the push to `develop` created by a PR merge. It
checks that the latest successful PR validation is for the merged head, that
its image artifact's source tree matches the merged commit, and that both test
and security workflows succeeded. It promotes and deploys those exact images
without repeating their validation. An expired or mismatched artifact blocks
deployment; do not rebuild or publish an unvalidated replacement from the
deployment workflow.
