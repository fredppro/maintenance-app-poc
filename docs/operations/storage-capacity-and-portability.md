# Garage and VPS storage usage

The container and bucket names in the example are repository-recorded
staging identifiers, not a live inventory. Confirm the current container,
bucket, and host before running the read-only utility. See
[environment status](../reference/environment-status.md).

Use this read-only check to distinguish the size of uploaded objects from the
space actually used on the VPS. Garage's bucket total is the logical object
size; Docker volume and filesystem usage include storage overhead and other
data on the host.

## Run the utility

From the repository root on your Mac, copy the helper to the VPS:

```sh
scp scripts/ops/garage-storage-usage.sh ops@10.242.0.1:/home/ops/garage-storage-usage.sh
```

Then run it on the VPS. `sudo` is needed to inspect Docker and measure its
volume directories:

```sh
ssh -t ops@10.242.0.1 'sudo bash /home/ops/garage-storage-usage.sh garage-cor2rjs7kkkpwvyp6xtih5q9 maintenance-staging-files'
```

The report includes:

- Root filesystem capacity and free space (`df`).
- Docker's aggregate storage summary and the Garage container's writable layer.
- Each host-backed Garage mount's filesystem capacity and directory usage.
- Garage's object count and logical byte total for `maintenance-staging-files`.

The Garage mount directory is the best estimate of Garage's actual disk
footprint. The bucket total is useful for tracking uploaded image growth, but
does not represent all VPS usage or include every filesystem and storage
overhead. Use the mount's `df` line to see the free space on the filesystem
that holds it.

Run this periodically and before large uploads or deployments. If the mount
filesystem is approaching capacity, plan to expand storage or move data before
it becomes full; a full disk can affect Garage and other services on the VPS.
The utility does not delete data or change the server.

## Garage portability validation (proposed; not tested)

The application uses a minimal object-storage interface (`put`, `get`, and
`delete`). It does not provide an object-listing or bulk-copy operation, and
this usage utility only measures the VPS; it does not prove that Garage data
can be migrated or restored.

For a future portability rehearsal, use synthetic files and disposable source
and destination buckets in an isolated environment. Inventory object keys
using the storage providers' administrative tooling, copy objects while
preserving keys and content types, compare object counts and total bytes, and
verify SHA-256 checksums for representative objects. Then exercise the
application's authenticated read path and export flow against the destination.
Do not delete the source or switch live traffic as part of this test. Any
production cutover requires a separately approved write-freeze or dual-write
plan, rollback criteria, and verified independent backups.
