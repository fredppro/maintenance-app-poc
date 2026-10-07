# Privacy data map

Technical inventory of where personal data lives. This is engineering documentation for a privacy/legal
review, **not** a legal record of processing (Art. 30 GDPR) and not a compliance statement.

## Data flow

```
Browser ─► Next.js app ─► PostgreSQL (shared schema, RLS)  ─► backups (pg_dump → off-site bucket)
              │       └─► S3-compatible object storage (equipment photos, export ZIPs)
              ├─► Resend (transactional email: verification, reset, invitations)
              ├─► Vercel (hosting) + optional Vercel Analytics (off unless NEXT_PUBLIC_ENABLE_ANALYTICS=true)
              └─► stdout JSON logs (redacted by src/lib/logger.ts)
```

No error tracker, queue, search service or AI provider is integrated.

## Personal data by category

| Category | Fields | Data subject | Purpose | Retention | Erasure | In tenant export |
| --- | --- | --- | --- | --- | --- | --- |
| Identity / contact (account) | `user.name`, `user.email`, `user.image` | App users | Account, access | Life of account | `pnpm ops:privacy erase-user` | No (account data, not tenant data) |
| Authentication secrets | `account.password` (hash), tokens, `verification.value` | App users | Sign-in | Life of account; `verification` purged on expiry | Deleted with the user | Never |
| Security metadata | `session.ipAddress`, `session.userAgent`, `session.token` | App users | Session security | Purged 7 days after expiry (`pnpm ops:retention`) | Deleted with the user | Never |
| Membership | `member`, `invitation.email`, `invitation.role` | App users, invitees | Access control | Invitations purged 30 days after expiry | Deleted with the user / on org delete | Yes (members) |
| Worker records | `worker.name/email/phone`, `vendor.contact/email` | Technicians, vendor contacts (not app users) | Assign maintenance work | Trash 30 days (`pnpm ops:purge-trash`), then permanent | `eraseWorkerPersonalData` action (anonymises, keeps assignment history) | Yes |
| Operational data | equipment, tasks, sites, materials, photos | Customer business data (may incidentally name people) | Core product | Until deleted by the tenant | Org deletion purges rows and objects | Yes |
| Audit trail | `organization_audit_event` (`actorUserId`, `details`) | Actors, invitees | Security / accountability | **Not deleted automatically** | Email scrubbed from `details` on user erasure; actor id is opaque | No |
| Operational limits | `rateLimit.key` (may embed IP) | Visitors | Abuse prevention | Purged after 24 h | n/a | No |

No special-category data (Art. 9) is collected by the schema; free-text fields (`notes`, `metadata`) could contain
anything a customer types. `NEEDS_PRODUCT/LEGAL_DECISION`: whether to forbid special categories in the terms.

## Processors and transfers

Verify each against the provider's *current* DPA and region settings; nothing below is assumed.

| Provider | Purpose | Personal data | Role (candidate) | Action required |
| --- | --- | --- | --- | --- |
| Neon (PostgreSQL) | Primary DB, PITR | All of the above | Processor | Confirm project region is in the EEA; sign DPA |
| Vercel | Hosting, logs | Request metadata, logs | Processor | Confirm function region and DPA/SCCs |
| Resend | Email | Recipient address, message | Processor | Confirm DPA, sending region |
| S3-compatible bucket | Photos, exports, backups | Photos, exports | Processor | Confirm bucket region, private ACL, encryption at rest |
| Vercel Analytics | Usage analytics | Page-view metadata | Processor | **Disabled by default**; enable only after legal review |
| GitHub Actions | Runs backup job | Backup passes through runner memory/disk | Processor | Backups are not encrypted by the script beyond the bucket's SSE — see `docs/gdpr-readiness.md` |

`LEGAL/PRODUCT DECISION REQUIRED:` controller/processor roles per customer (the SaaS is likely a processor for
tenant data and a controller for account data), DPA template, sub-processor list publication.
