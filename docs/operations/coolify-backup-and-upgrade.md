# Runbook 03: Coolify backups and upgrades

Part of [self-hosted-platform-plan.md](../planning/self-hosted-platform-plan.md), sections 5 and 6.

**Scope:** Coolify's own control-plane database, a local/offline copy, and the pre-upgrade checklist. This does not
back up the application's PostgreSQL data or Garage file objects; those require separate backup procedures.

## Dated operator observation (2026-10-28)

This section preserves a report from that date; it is not confirmation of
current settings or backup availability. See
[environment status](../reference/environment-status.md) for the remaining checks.

Recorded on 2026-10-28:

- The Coolify update check reported no newer version available. The PHP CLI in the running `coolify` container
  reported `PHP 8.4.27`.
- A manual Coolify database backup completed successfully. Coolify reported 699.28 KB; the copied file is 716,067
  bytes and is a PostgreSQL custom database dump.
- Local retention is set to 3 backups, 7 days, and 2 GB. The schedule shown is `0 0 * * *` UTC (daily). The
  backup page continued to show an unsaved-changes banner for the instance-database section, so verify the displayed
  settings in Coolify before relying on future scheduled runs.
- The local copy is `~/Backups/coolify/coolify-pre-upgrade.dmp`. Its mode is `0600`; the `coolify` directory is
  `0700`. FileVault was confirmed on. Its SHA-256 matched the staged server copy:
  `5808f5bc3615e3de055146ba70805ab003acf041d4bd368ea90282f6c06483e3`.
- The temporary transfer copy under `/home/ops` was removed after verification. The original Coolify backup remains
  under `/data/coolify/backups/`.
- Coolify has no validated S3 backup destination configured. Cloudflare R2 was not enabled because its setup
  requires a billing subscription and usage above the free allowance is billable.
- The backup has **not** been restored or otherwise restore-tested. `pg_restore` was not installed on the Mac at the
  time of this check.

The Contabo snapshot is an additional rollback aid, not an independent backup: it is held by the same provider as the
VPS. The Mac copy is a separate offline copy, but it is operator-managed and is not an automated off-provider
backup service.

## Backup layers and boundaries

Keep these distinct:

1. **Coolify instance backup:** Coolify's own PostgreSQL database and control-plane state. Needed to restore the
   Coolify dashboard and its saved configuration.
2. **Application database backups:** `pg-shared` and any dedicated tenant PostgreSQL instances. A Coolify instance
   backup does not contain these database dumps; see [tenant lifecycle and recovery](tenant-lifecycle-and-recovery.md)
   for the application-data backup process.
3. **Application files:** Garage is a single-node staging service on the same VPS. It is not an off-host backup of
   uploaded files and does not protect against loss of that VPS.
4. **Contabo snapshot:** useful for quickly rolling back the host, but it shares the VPS provider/failure domain.
5. **Offline Mac copy:** a manually copied Coolify database dump stored on the FileVault-encrypted development Mac.
   Keep it outside the repository and any unencrypted/shared folder.

Coolify backups and the `APP_KEY` are both sensitive. Keep the `APP_KEY` in its approved encrypted secret backup,
separate from this repository and chat. The `APP_KEY` may be required to decrypt protected values after restoring
Coolify state.

## Create a manual Coolify instance backup

1. Connect to the server through WireGuard and open Coolify at `http://10.242.0.1:8000`.
2. Go to **Settings → Backup**. Confirm the instance database points to Coolify's internal database (`coolify-db`).
3. Confirm the schedule and retention values. The verified values are daily at `00:00 UTC`, with 3 local backups,
   7 days, and a 2 GB local-storage cap.
4. Click **Back up now**.
5. In **Executions**, wait for the row to show **Success**. Record its timestamp, size, and exact archive path. Do
   not copy a row still marked **In progress** or **Failed**.
6. If Coolify displays an unsaved-changes warning, do not assume scheduled settings are active solely because the
   page is open. Recheck the values after reload and resolve the warning before relying on scheduled backups.

The path shown in the execution record is generated per run. Do not assume a prior filename remains present after
retention cleanup.

## Copy a backup to the FileVault-protected Mac

Use the exact source path displayed in the successful execution row. The commands below stage the root-protected
archive as a private file owned by `ops`, copy it to the Mac, compare checksums, and remove only the temporary
staging copy.

Run these commands in the Mac terminal. The `ssh -t` command prompts for the server's `sudo` password in the
terminal; never send that password in chat.

```sh
fdesetup status
umask 077
mkdir -p "$HOME/Backups/coolify"
chmod 700 "$HOME/Backups/coolify"

# Replace this with the exact path from the successful Coolify execution row.
BACKUP_PATH='/data/coolify/backups/coolify/coolify-db-hostdockerinternal/REPLACE_WITH_CURRENT_FILENAME.dmp'

ssh -t ops@10.242.0.1 \
  "sudo install -o ops -g ops -m 600 '$BACKUP_PATH' /home/ops/coolify-pre-upgrade.dmp"

scp ops@10.242.0.1:/home/ops/coolify-pre-upgrade.dmp \
  "$HOME/Backups/coolify/coolify-pre-upgrade.dmp"
chmod 600 "$HOME/Backups/coolify/coolify-pre-upgrade.dmp"

ssh ops@10.242.0.1 'sha256sum /home/ops/coolify-pre-upgrade.dmp'
shasum -a 256 "$HOME/Backups/coolify/coolify-pre-upgrade.dmp"
```

Confirm the two SHA-256 values match. If they do not, stop and copy again; do not remove the temporary server copy.
After a match, remove only that temporary copy:

```sh
ssh ops@10.242.0.1 'rm -- /home/ops/coolify-pre-upgrade.dmp'
```

Keep the original Coolify-managed archive and the verified Mac copy. Do not remove the original archive as part of
this transfer. Do not commit the dump to Git or place it in an unencrypted sync folder.

## Before a Coolify or host upgrade

1. Confirm access to the Coolify dashboard over WireGuard and confirm the staging health endpoint is healthy.
2. Run **Back up now**, confirm **Success**, copy the archive to the Mac, and compare checksums before changing
   snapshots.
3. Create and confirm a fresh Contabo snapshot. If the current one-slot plan requires removing the existing
   snapshot first, do so only after the new database copy is verified on the Mac; start the replacement snapshot
   immediately and do not upgrade until it completes successfully. If the provider allows multiple snapshots,
   retain the last known-good one until its replacement has completed and the upgrade has been verified.
4. Confirm the `APP_KEY` is available from its approved encrypted backup. Do not print or paste it into chat.
5. Open **Settings → Updates**. If Coolify reports **No new version available**, do not force an upgrade. If an
   update is available, review the official release notes and use Coolify's supported update action; do
   not hand-edit Coolify's container image tag.
6. After an upgrade, verify Coolify is responsive, check staging health and application logs, and confirm the
   expected version of every relevant runtime. A PHP CLI version reported inside a container does not necessarily
   prove the version used by every PHP-FPM or Apache worker; verify the web-serving runtime and restart its workers
   when applicable. Keep the snapshot and database dump until these checks pass.
7. Record the deployed Coolify/PHP versions and any post-upgrade verification results in this runbook or the
   operations log.

For the PHP security release checked on 2026-10-28, the running `coolify` container reported PHP 8.4.27 and the
Coolify update page reported no newer version. No manual upgrade was run during that verification.

## Restore and recovery

- Never restore this dump over a live Coolify database as an exploratory test.
- Restore only into an isolated Coolify instance or replacement host, following the documented procedure for the
  installed Coolify release and using the protected `APP_KEY`.
- Verify that the dashboard and saved resources can be read before relying on the restore. A successful dump and
  matching checksum are not a restore test.
- For full VPS replacement, use [runbook 00](vps-recovery.md). It covers host recovery and explicitly
  treats Coolify, application databases, files, secrets, DNS, and TLS as separate recovery concerns.
- Configure and validate a separate off-host S3 destination before treating scheduled Coolify or application
  backups as disaster recovery. Any paid storage subscription or usage-based billing requires explicit approval.
