# Invite-only pilot readiness

## Organization roles

Every server operation checks the signed-in user's membership in the active
organization. Site selection is validated against that membership and the
organization before a site-scoped query runs. The active site is stored in an
HttpOnly, SameSite=Lax cookie; an invalid or stale site selection is never used
to scope queries.

| Capability | Owner | Admin | Maintenance manager | Read-only |
| --- | --- | --- | --- | --- |
| View maintenance data and workers | Yes | Yes | Yes | Yes |
| View/download task reports | Yes | Yes | Yes | Yes |
| Create/update equipment and tasks; move tasks | Yes | Yes | Yes | No |
| Delete equipment and tasks | Yes | Yes | Yes | No |
| Create/update/delete workers | Yes | Yes | Yes | No |
| Invite organization members | Yes | Yes | No | No |
| Invite an admin | Yes | No | No | No |
| Change roles/remove non-owner members; revoke pending invitations | Yes | Yes | No | No |
| Create the initial site | Yes | Yes | No | No |
| Organization administration | Yes | Yes | No | No |
| Choose among sites/organizations where they are a member | Yes | Yes | Yes | Yes |

The Better Auth `member` role is treated as read-only for application
permissions. Better Auth's direct member mutation endpoints are disabled for
all roles; the application uses tenant-scoped server actions for member
changes. Owners and admins can update/remove non-owner members and revoke
pending invitations. Admins cannot manage owners or other admins, invite an
admin, or revoke an admin invitation. Neither role can change ownership or
remove their own membership through this interface.
Each successful membership/invitation change writes an organization-scoped
audit event in the application database. This event history is not tamper-proof
against a database administrator. Creating additional sites and transferring
ownership still require an authorized operational process.

## Production account setup

Production account creation is restricted server-side:

- `PILOT_BOOTSTRAP_EMAIL` identifies the one account permitted to register
  before the first customer organization exists. A migration-created
  `legacy-workspace` does not count as a customer organization and is never
  claimed by bootstrap. It is for initial setup only; remove the value after
  the owner account and organization are established.
- Later accounts can register only when a pending, unexpired organization
  invitation already exists for that email address. The invitation page checks
  the signed-in email again before accepting the invitation.
- Email verification is required for sign-in, and invitations require a
  verified email, in production.
- Password recovery, verification, and organization invitation links use the
  Resend API. Configure a verified sender before inviting users.
- `BETTER_AUTH_URL` must be the exact public HTTPS origin. Better Auth only
  trusts that origin, and secure cookies are enabled in production.
- Better Auth rate limiting uses the shared PostgreSQL database in production,
  so application instances share limit state. Keep provider/ingress limits as
  an additional perimeter control; application rate limiting does not replace
  DDoS protection.

The bootstrap account should be registered and verified before inviting pilot
users. Do not keep open registration enabled or remove the server-side signup
gate to simplify onboarding.

## Database deployment and legacy ownership

Use a separate PostgreSQL database and credentials for every environment.
Before deploying a schema change:

1. Verify the target environment and take/confirm a provider-native backup.
2. Test the migration against a staging database restored from a recent backup.
3. Check status with `pnpm exec prisma migrate status` using the target
   environment's `DATABASE_URL`.
4. Deploy committed migrations with `pnpm prisma:migrate:deploy`.
5. Check `/api/health` and perform an application smoke test.

Do not use `prisma db push` for production and do not point browser tests at a
shared or production database. E2E runs use the independently configured
`E2E_DATABASE_URL`.

The existing tenant migration keeps pre-tenant rows in an unclaimed legacy
organization and site. The application intentionally does not grant the
historical data to the first registrant. Before upgrading a database containing
legacy customer data, identify its rightful owner, verify the organization/site
mapping, and obtain an approved ticket and verified backup. Create and verify
the rightful owner's account, then run the assignment from a protected
operator environment:

```sh
LEGACY_OWNER_EMAIL="owner@example.com" \
LEGACY_ORGANIZATION_NAME="Customer name" \
LEGACY_ORGANIZATION_SLUG="customer-name" \
LEGACY_SITE_NAME="Main plant" \
LEGACY_ASSIGNMENT_OPERATOR="operator@example.com" \
LEGACY_ASSIGNMENT_TICKET="CHANGE-123" \
CONFIRM_LEGACY_OWNERSHIP="ASSIGN LEGACY DATA TO owner@example.com" \
pnpm legacy:assign-owner
```

The command requires the exact confirmation phrase, a verified existing owner
account, a unique customer slug, no existing legacy members, and the legacy
site. In one serializable transaction it renames the organization and site,
grants the nominated account the owner role, and records the previous names,
operator, ticket, site, and owner in `legacy_ownership_assignment`. It refuses
to reassign an organization with an existing assignment audit. Protect the
operator environment and database credentials; the audit record is not
tamper-proof against a database administrator.

## Backup and restore

See [tenant-lifecycle-and-recovery.md](tenant-lifecycle-and-recovery.md) for the
recovery targets, the scheduled backup workflow, the restore test and the
recovery procedure. Provider-managed PITR and an off-account backup bucket
still have to be enabled by the deployment owner. Keep backup credentials
separate from application credentials.

For a portable logical backup where PostgreSQL client tools are available:

```sh
pg_dump --format=custom --file=maintenance.dump "$DATABASE_URL"
```

Restore only into a newly provisioned, isolated recovery/staging database.
`pg_restore` can overwrite objects when options such as `--clean` are used:

```sh
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" maintenance.dump
```

Verify the restored database with Prisma migration status, `/api/health`, and
application-level checks before directing any environment to it. Store
connection strings in a secret manager or protected environment, not shell
history, CI logs, source control, or this documentation.

## Operational limits

- `/api/health` verifies database reachability and the presence of production
  email/bootstrap configuration. It returns only `ok` or `unavailable`; it
  does not disclose provider details.
- Production Prisma query logging is disabled. Readiness failures emit a
  small structured event without database exception text. Unhandled
  server errors are logged as structured, redacted JSON
  (`src/instrumentation.ts`); there is no external error-reporting or
  alerting provider.
- Responses include frame/content-type protections, a restrictive referrer
  policy, and disabled camera/microphone/geolocation access. Production
  responses additionally enable HSTS; TLS termination must be configured at
  the deployment ingress before enabling production traffic.
- The repository contains no production deployment manifest, staging
  environment or secret store. A backup workflow and restore-test script
  exist, but need the deployment owner's bucket and secrets.
- Real email delivery, verification, password reset, and invitations require
  valid Resend credentials and a verified sender. The repository cannot
  validate deliverability without those credentials.
