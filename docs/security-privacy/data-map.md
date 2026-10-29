# Privacy data map

Technical inventory of where personal data lives. This is engineering documentation for a privacy/legal
review, **not** a legal record of processing (Art. 30 GDPR) and not a compliance statement.

## Data flow

```
Browser ─► Next.js app (live host unverified) ─► PostgreSQL (shared schema, RLS; live provider unverified)
              │                                  └─► scheduled logical-backup workflow
              │                                      (configuration, destination and runs unverified)
              ├─► S3-compatible object storage (photos, export ZIPs; live service unverified)
              ├─► Resend API (integration in code; live account/settings unverified)
              └─► stdout JSON logs (scrubbing is limited; see logging note below)
```

No error tracker, queue, search service or AI provider is integrated.
The repository retains Vercel/Neon compatibility code, and a dated platform
plan describes Coolify/Contabo, staging Garage, and planned production storage.
Neither source establishes the current live providers or regions; see
[environment status](../reference/environment-status.md).

## Personal data by category

| Category | Fields | Data subject | Purpose | Retention | Erasure | In tenant export |
| --- | --- | --- | --- | --- | --- | --- |
| Identity / contact (account) | `user.name`, `user.email`, `user.image` | App users | Account, access | Life of account | `pnpm ops:privacy erase-user` | No (account data, not tenant data) |
| Authentication secrets | `account.password` (hash), tokens, `verification.value` | App users | Sign-in | Life of account; `verification` purged on expiry | Deleted with the user | Never |
| Security metadata | `session.ipAddress`, `session.userAgent`, `session.token` | App users | Session security | Purged 7 days after expiry (`pnpm ops:retention`) | Deleted with the user | Never |
| Membership | `member`, `invitation.email`, `invitation.role` | App users, invitees | Access control | Invitations purged 30 days after expiry | Deleted with the user / on org delete | Yes (members) |
| Company profile | `tenant_settings.contactEmail/contactPhone` (optional), organization name, logo | Customer business contacts | Identify the organization | Life of the organization | Org deletion; owners can clear the fields | Yes (`data/organization`, logo in `files/`) |
| Worker records | `worker.name/email/phone`, `vendor.contact/email` | Technicians, vendor contacts (not app users) | Assign maintenance work | Trash 30 days (`pnpm ops:purge-trash`), then permanent | `eraseWorkerPersonalData` action (anonymises, keeps assignment history) | Yes |
| Operational data | equipment, tasks, sites, materials, photos | Customer business data (may incidentally name people) | Core product | Until deleted by the tenant | Org deletion purges rows and objects | Yes |
| Audit trail | `organization_audit_event` (`actorUserId`, `details`) | Actors, invitees | Security / accountability | **Not deleted automatically** | Email scrubbed from `details` on user erasure; actor id is opaque | No |
| Operational limits | `rateLimit.key` (may embed IP) | Visitors | Abuse prevention | Purged after 24 h | n/a | No |

No special-category data (Art. 9) is collected by the schema; free-text fields (`notes`, `metadata`) could contain
anything a customer types. `NEEDS_PRODUCT/LEGAL_DECISION`: whether to forbid special categories in the terms.

## Processors and transfers

Verify each against the provider's *current* DPA and region settings; nothing below is assumed.

| Service or provider category | Purpose in code or plan | Personal data | Role (candidate) | Action required |
| --- | --- | --- | --- | --- |
| Application host | Next.js app; a dated plan identifies self-hosted Coolify/Contabo | Request metadata and application data | Candidate processor | Confirm live host, access, region, logs, retention, and applicable DPA |
| PostgreSQL | Database and tenant records; provider is configurable in code | All database categories above | Candidate processor | Confirm live provider, account, region, backup/PITR, access policy, encryption, and DPA |
| S3-compatible object storage | Photos and export ZIPs; backup workflow can upload database dumps | Photos, exports, and possibly database dumps | Candidate processor | Confirm each live bucket, provider, region, access policy, encryption, lifecycle, and independent recovery |
| Resend | Transactional email integration | Recipient address and message | Candidate processor | Confirm whether configured, plus account, sending region, and DPA |
| Vercel Analytics | Optional code integration | Page-view metadata | Candidate processor | Code is gated by production and an explicit flag; confirm live use before enabling or listing it as a processor |
| GitHub Actions | Scheduled database-backup workflow | A dump is created on the runner and may be uploaded | Candidate processor | The script does not encrypt the dump; workflow configuration and runs are unverified. Confirm runner handling and destination encryption/access protections |

`LEGAL/PRODUCT DECISION REQUIRED:` controller/processor roles per customer (the SaaS is likely a processor for
tenant data and a controller for account data), DPA template, sub-processor list publication.
