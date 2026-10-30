# Runbook 05: secret and credential rotation

This runbook covers the credential types identified in the application, GitHub
workflows, Coolify, Garage, Contabo, and VPS administration. It records names
and procedures only; never put credential values, private keys, recovery codes,
or screenshots of secret fields in this document or the repository.

The repository shows which credentials may be used, but not which values are
currently configured in Coolify, GitHub, provider accounts, or on the VPS.
Before a rotation, inspect those stores by **name and scope only**. Do not read,
export, or paste existing values into chat.

## 1. Standard rotation procedure

For each credential, write down its name, issuer, every consumer, the planned
cutover, and how success will be checked. Rotate one credential class at a time.

1. **Check impact and recovery.** Identify all applications, preview
   deployments, scheduled jobs, database clients, and operators that use the
   credential. For database or Coolify control-plane changes, ensure a recent
   backup and a recovery path are available. See
   [Coolify backups and upgrades](coolify-backup-and-upgrade.md) and
   [tenant lifecycle and recovery](tenant-lifecycle-and-recovery.md) for
   application data backups.
2. **Create a replacement first** when the issuer supports overlapping
   credentials. Give it only the required permissions and a unique name.
3. **Update every consumer.** Use the issuing service and Coolify/GitHub
   settings as appropriate. Do not store values in `terraform.tfvars`, shell
   history, command arguments, CI logs, tickets, or this repository.
4. **Activate the change.** Saving a Coolify variable does not update an
   already-running container: redeploy the affected application or job.
5. **Verify before revoking.** Check the specific operation that uses the
   credential, not just that a deployment started. Check health, logs, and the
   relevant workflow. Never include secret values in diagnostic output.
6. **Revoke the old credential** at its issuer only after all consumers pass.
   Confirm it no longer appears in active settings or running jobs.
7. Record the date, credential name, affected consumers, verification, and
   revocation status—never the value.

For a **suspected compromise**, contain first: revoke or disable the exposed
credential at its issuer, then replace it in every consumer and accept the
necessary service interruption. Do not wait for a routine maintenance window.
See [incident response](incident-response.md).

## 2. Accessing Coolify and the VPS

Connect WireGuard on the Mac before using the private administration address.

```sh
ssh -t ops@10.242.0.1
```

For Coolify, open `http://10.242.0.1:8000` while connected to WireGuard and
sign in with the operator account and its 2FA. The public-facing staging app is
not the Coolify control panel.

In Coolify, use **Normal View** to edit locked secrets. Find the project,
environment, and application, then open its environment variables. Review
**Production** and **Preview deployments** separately, and check every page of
the list. Also check **Shared Variables** if the application references any.
Save the changes and use **Redeploy**; wait for success before testing.

The VPS file `/data/coolify/source/.env` contains Coolify control-plane secrets.
Do not `cat`, print, or edit it as part of ordinary app-secret rotation. The
current copy is mode `0600`; keep its backup encrypted and off-host. Internal
Coolify encryption, database, and Redis secrets are not app environment
variables and must not be changed by manually editing that file.

## 3. Known credential inventory

| Credential or variable | Where it is used | Rotation path |
|---|---|---|
| `DATABASE_URL` | Coolify application; restricted PostgreSQL runtime role | Rotate the database role, update the URL in every relevant Coolify scope, redeploy, and smoke-test. |
| `MIGRATION_DATABASE_URL` | Migration/owner connection; GitHub `production-maintenance` environment where configured | Rotate the database owner credential and update every migration consumer. Keep it separate from the runtime role. |
| `BACKUP_DATABASE_URL` | Referenced as a GitHub repository Actions secret by the optional backup workflow on `develop`; configuration is unverified | Rotate the database credential it uses and update the repository secret. The workflow is not present in the default-branch workflow list and has no recorded run; verify activation before relying on or testing it. |
| `BETTER_AUTH_SECRET` | Coolify application | Replace with a newly generated random value and redeploy. Existing sessions will be invalidated; users must sign in again. |
| `RESEND_API_KEY` | Coolify application email delivery | Create a replacement API key in Resend, update Coolify, send a real test email, then revoke the old key. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Coolify application and GitHub `production-maintenance` environment where configured | Create a new restricted Garage key, update all consumers, redeploy/test uploads and jobs, then delete the old Garage key. |
| `S3_AUDIT_ACCESS_KEY_ID`, `S3_AUDIT_SECRET_ACCESS_KEY` | Operator environment for read-only storage inventory, if configured | Create a replacement key limited to listing the intended bucket; update the protected operator environment, verify an inventory run, then revoke the old key. Never reuse the application's object-write credential for inventory. |
| `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY` | GitHub repository Actions secrets for off-host database backups, if enabled | Create a replacement least-privilege storage credential, update GitHub, run and verify the backup workflow, then revoke the old credential. |
| GHCR personal access token (`read:packages`) | Coolify server registry login | Create a replacement read-only token, update the registry login in Coolify, verify an image pull/deploy, then revoke the old token in GitHub. |
| GitHub account password and MFA | GitHub web account and token administration | Change in GitHub account security settings, revoke unfamiliar sessions, and re-check token ownership and expiry. |
| `CNTB_OAUTH2_CLIENT_SECRET`, `CNTB_OAUTH2_USER`, `CNTB_OAUTH2_PASS` | Local Contabo Terraform/API operations | Rotate through Contabo, update the local password manager or protected shell environment, and refresh the local token cache. |
| SSH client private key | Mac operator access to `ops` (and root only if separately authorized) | Add and test a new public key before removing the old key from `authorized_keys`. |
| `ops` sudo password | VPS administration | Change from an active VPN SSH session with `sudo passwd ops`; verify sudo access before closing the session. |
| VPS root password | Provider console/recovery only; SSH password login is disabled | Reset through Contabo only when needed; do not confuse it with the Contabo account password or an SSH key. |
| WireGuard client private key | Mac VPN peer | Replace as a coordinated peer change; follow the WireGuard caution below. |
| WireGuard server private key | `/etc/wireguard/server_private.key` on the VPS | Not a routine rotation. Requires replacing the server public key in every client profile and testing access through a separate recovery path. |
| Coolify account password and 2FA | Coolify operator account | Change the account password in Coolify; if the authenticator is compromised, re-enrol and verify 2FA with a fresh session. Keep a tested administrator/recovery path. |
| Coolify internal `.env` secrets | Coolify control plane | Do not rotate individually by editing the file. Use Coolify's supported procedure with a verified backup and recovery plan. |
| Contabo account password and MFA | Contabo Customer Control Panel | Change in the provider account settings; confirm access to the VPS and API credentials separately. |
| Garage `admin_token` / RPC secret, if configured | Garage administration and cluster communication, not app S3 access | Do not use as application credentials. Rotate only as a coordinated Garage service change using the Garage configuration and recovery procedure. |

`BACKUP_S3_URI`, `BACKUP_AWS_REGION`, `S3_ENDPOINT`, `S3_BUCKET`,
`S3_REGION`, `S3_FORCE_PATH_STYLE`, `BETTER_AUTH_URL`, and `AUTH_EMAIL_FROM`
are configuration values, not secret keys. Change them only when their
underlying endpoint, bucket, region, origin, or sender changes.

The backup workflow on `develop` references repository Actions secrets; whether
they are configured is unverified. The maintenance workflow uses the
`production-maintenance` environment. In GitHub, inspect both
**Settings → Secrets and variables → Actions → Repository secrets** and
**Environments → production-maintenance → Environment secrets** by name. Do
not assume a value exists just because a workflow refers to it.

### Local development and CI values

The `docker-compose.yml`, `.env.example`, tests, and CI workflows contain
development or disposable test credentials. They are not production
credentials. Do not copy them into Coolify. In particular, the local PostgreSQL
and MinIO passwords and the test `BETTER_AUTH_SECRET` are not rotated with
production keys. GitHub's workflow `GITHUB_TOKEN` is automatically issued and
short-lived; it does not need manual rotation.

`TENANT_CREDENTIAL_KEYS` appears in an older assessment document but is not
referenced by the current application source. Treat it as inactive unless a
live deployment inventory confirms otherwise.

No application reference to Coolify API tokens or DNS-provider API tokens was
found in the repository. If either was created manually in a provider or
Coolify account, include it in the live inventory and revoke unused tokens.
Keep account credentials for GitHub, Contabo, DNS, and the domain registrar in
the password manager; rotate them at the issuing provider, not in application
environment variables.

## 4. Application secrets in Coolify

For each changed value, update every scope and consumer listed in the
inventory, save, redeploy, and then verify the real feature:

- **`BETTER_AUTH_SECRET`:** generate a fresh random value of at least 32
  characters using an approved password manager or local secure generator.
  Redeploy promptly. This signs authentication/session tokens, so expect all
  users to sign in again.
- **`RESEND_API_KEY`:** create a new key in Resend with only the permissions
  required for the app. Update Coolify and verify a sign-up or verification
  email arrives from the configured sender. Then revoke the prior key.
- **S3/Garage credentials:** follow the dedicated sequence below. Preserve
  `S3_ENDPOINT`, `S3_REGION=garage`, bucket, and path-style settings unless
  they independently need to change.
- **Database URLs:** rotate the database credential at PostgreSQL first, then
  update every consumer. For an in-place password change, schedule a short
  maintenance window because new database connections can fail between the
  database password change and the app redeploy. A parallel role can reduce
  downtime, but it must have the same least-privilege grants and RLS behavior;
  verify it before switching.

After redeploy, check that Coolify reports **Running**, `/api/health` succeeds,
and the affected operation succeeds (sign-in/email, database-backed action, or
image upload). For database changes, also verify the migration and scheduled
maintenance consumers that use the owner URL.

## 5. Rotating Garage S3 keys

The current staging Garage container is named
`garage-cor2rjs7kkkpwvyp6xtih5q9`; the staging bucket is
`maintenance-staging-files`. Confirm the live container and bucket if Coolify
has recreated the service.

1. Connect to the VPS as described in section 2.
2. Create a uniquely named replacement key:

   ```sh
   sudo docker exec -it garage-cor2rjs7kkkpwvyp6xtih5q9 /garage key create maintenance-staging-rotate-YYYYMMDD
   ```

   Treat any key details printed by this command as secret output.

3. Grant it only the needed bucket access, using the new key ID:

   ```sh
   sudo docker exec -it garage-cor2rjs7kkkpwvyp6xtih5q9 /garage bucket allow maintenance-staging-files --key NEW_KEY_ID --read --write
   ```

4. If needed, retrieve the new key details on the VPS:

   ```sh
   sudo docker exec -it garage-cor2rjs7kkkpwvyp6xtih5q9 /garage key info --show-secret maintenance-staging-rotate-YYYYMMDD
   ```

   The command displays the secret in the VPS terminal. Enter it directly into
   Coolify; never paste it into chat, a log, or this runbook.
5. Update `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in each used Coolify
   scope. Update the GitHub `production-maintenance` environment too if its
   retention/purge job uses the bucket.
6. Save, redeploy the app, retry an image upload, and verify any relevant
   maintenance workflow.
7. Only after those checks pass, remove the old key:

   ```sh
   sudo docker exec -it garage-cor2rjs7kkkpwvyp6xtih5q9 /garage key delete OLD_KEY_ID
   ```

   Confirm the old key is absent from `garage key list` and that the new key
   still has only the required bucket permissions.

**Existing follow-up:** a previous Garage default key was exposed during
troubleshooting. Treat that key as compromised until you verify it has been
revoked and no service still depends on it. Do not reuse it.

## 6. Database passwords

Before changing a database credential, identify the database and role behind
each URL without printing the URL. The runtime URL must use the restricted
`maintenance_app_runtime` role; the owner URL is for migrations and approved
administrative jobs only. See [tenant isolation](../architecture/tenant-isolation.md).

Prefer a planned cutover:

1. Confirm a recent application-database backup and a way to restore it.
2. If using an in-place password change, connect through the approved database
   console/client and use its interactive password prompt (for `psql`, the
   `\password ROLE_NAME` command). Do not put a password in SQL text or a
   command-line URL.
3. Update `DATABASE_URL`, `MIGRATION_DATABASE_URL`, and
   `BACKUP_DATABASE_URL` wherever they are actually configured. Update Coolify
   and GitHub Actions separately; changing one does not update the others.
4. Redeploy the app and run the relevant migration, backup, or maintenance
   workflow. Verify the app role still enforces RLS and is not a superuser or
   table owner (`pnpm db:verify-role` against the runtime URL).
5. Revoke the old role or password only after every consumer has switched.

Do not reset a shared database role while other apps or jobs still use it.
Dedicated customer databases require a separate inventory and one-at-a-time
rotation for each tenant.

## 7. GitHub and external provider credentials

### GitHub Actions secrets

In the repository, open **Settings → Secrets and variables → Actions**. Update
repository secrets there, and separately open
**Environments → production-maintenance** for its environment secrets.

- For the optional application database backup workflow, first verify that it
  is active on the default branch and configured. If so, replace
  `BACKUP_AWS_ACCESS_KEY_ID` and `BACKUP_AWS_SECRET_ACCESS_KEY` at the
  object-storage provider, update the repository secrets, run the workflow,
  and confirm a successful backup and new object before revocation.
- For scheduled retention jobs, update `MIGRATION_DATABASE_URL` and the S3
  pair if they changed; run the **Maintenance jobs** workflow manually and
  verify success.
- `BACKUP_DATABASE_URL` follows the database procedure above.

### GHCR image-pull token

Create a new GitHub personal access token (classic) with only `read:packages`.
In Coolify, update the registry login for `ghcr.io` under the server's
**Registries** settings. Verify a fresh image pull/deploy succeeds, then
revoke the old token in GitHub. Do not grant `repo`, `write:packages`, or
`delete:packages` for a pull-only credential.

### Contabo API credentials

Terraform uses `CNTB_OAUTH2_CLIENT_ID`, `CNTB_OAUTH2_CLIENT_SECRET`,
`CNTB_OAUTH2_USER`, and `CNTB_OAUTH2_PASS` locally. Rotate or recreate these
through Contabo's account/API credential controls, then update the protected
local environment or password manager. Do not put them in
`infra/contabo-firewall/terraform.tfvars`.

The provider caches an OAuth token at
`~/.cache/contabo/terraform/token`. After revoking the old API credentials,
remove only that cached token on the Mac so Terraform obtains a fresh one:

```sh
rm -f "$HOME/.cache/contabo/terraform/token"
```

Then run the read-only Contabo inventory/plan checks. Do not run `terraform
apply` merely to validate credential rotation.

## 8. VPS access keys and VPN

### SSH client key

Keep the current VPN SSH session open while rotating the operator key. On the
Mac, generate a new passphrase-protected key with a new filename; never
overwrite the old key:

```sh
ssh-keygen -t ed25519 -a 100 -f "$HOME/.ssh/maintenance_contabo_rotation" -C ops@maintenance
```

Add only its public key to the `ops` account, using the existing working key:

```sh
cat "$HOME/.ssh/maintenance_contabo_rotation.pub" | ssh -i "$HOME/.ssh/maintenance_contabo_2026" -o IdentitiesOnly=yes ops@10.242.0.1 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys'
```

Open a **new** terminal and verify key-only SSH and sudo with the new private
key:

```sh
ssh -i "$HOME/.ssh/maintenance_contabo_rotation" -o IdentitiesOnly=yes ops@10.242.0.1 'sudo -v'
```

Only after that succeeds, use `sudoedit /home/ops/.ssh/authorized_keys` from
the still-open session to remove the old public-key line. Repeat for root only
if it is separately authorized. Then open one more fresh session with the new
key before closing the recovery session. Do not remove the last working key.

Changing the VPS **host key** is different from changing the operator key.
Do this only after a rebuild or suspected host-key compromise, verify the new
fingerprint through the Contabo console or another trusted channel, and then
update the Mac's `known_hosts` entry.

### WireGuard keys

The Mac client private key and the VPS server private key are separate from
SSH keys. Never copy either private key into inventory, chat, or this
repository. Routine Mac-peer replacement requires a coordinated overlap:
install and verify the replacement peer and a new client profile before
removing the old peer. The current Ansible baseline expects exactly one peer;
do not apply it while an unreviewed temporary second peer is present. Update
the Ansible inventory to the final public peer key/IP and check the playbook
before applying. Keep an independent SSH/recovery session throughout.

Replacing the **server** WireGuard key affects every client profile and can
cut off administration; only do it as a planned recovery change after
recording a verified alternative access path. See
[WireGuard and VPN-only SSH](wireguard-admin-access.md) and the
[Ansible baseline](../../ansible/README.md).

## 9. Coolify control-plane and Garage internal secrets

Change the Coolify operator password and 2FA through the account UI. Store any
recovery material offered by Coolify in the password manager or approved
offline vault and verify it is available to the operator.

Coolify's internal encryption/application key and its PostgreSQL/Redis
credentials are coupled to the control-plane data and stored under
`/data/coolify/source/.env`. Do not rotate them by editing the file or
restarting containers with guessed values. Before any such recovery-level
change, follow Coolify's official procedure, take and verify an encrypted
off-host backup using [runbook 03](coolify-backup-and-upgrade.md), and
confirm how stored encrypted application credentials will be recovered.

Garage S3 keys are not Garage's `admin_token` or `rpc_secret`. Keep
administrative and cluster secrets separate from application bucket keys.
Changing Garage internal tokens requires coordinating the service
configuration and restart; use the Garage version's documented recovery
procedure and verify the cluster before changing application credentials.

## 10. Rotation record

Keep a record in the approved password manager or operational ticket:

| Date | Credential name | Issuer / consumers updated | Verification | Old credential revoked |
|---|---|---|---|---|
| YYYY-MM-DD | Name only; never the value | Systems/scopes | Test performed and result | Yes / No |
