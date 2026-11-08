# Maintenance notification delivery

The application creates two automatic notifications for each assigned worker on a scheduled maintenance task:

- An assignment notice is sent immediately after the task is created or its assignments are updated.
- A reminder is scheduled 24 hours before the task starts. If the task is scheduled with less than 24 hours' notice, the reminder is scheduled one hour before it starts; tasks starting within one hour are due immediately.

Automatic notifications are scoped to the task's current assignments. Cancelled, deleted, completed, or unassigned tasks do not produce pending automatic notifications. Rescheduling updates an unsent reminder; a notification that was already sent is not sent again.

Task managers can also send a manual email from the task editor. The confirmation lists the current assigned workers with valid email addresses and identifies workers who will be excluded because they have no usable address. Manual sends are recorded separately and do not consume either automatic notification.

The task editor loads the five most recent notification records first and fetches older records on demand. History pages are tenant- and site-scoped and ordered newest first.

## Configure delivery

1. Configure `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM`.
2. Set `CRON_SECRET` to a random secret generated independently of the auth secret (for example, `openssl rand -hex 32`).
3. Configure the deployment's scheduler to call `POST https://<application-origin>/api/cron/maintenance-reminders` every 15 minutes or more often with `Authorization: Bearer <CRON_SECRET>`.
4. Keep the secret in the deployment's secret store and the scheduler's protected headers; do not put it in a repository, URL, or scheduler logs.

The endpoint returns aggregate counts only. Invalid credentials receive `401`; missing secret configuration receives `503`. Email failures are recorded per notification and retried with exponential backoff, capped at five attempts. A stable Resend idempotency key is used across retries. Inspect application logs for organization-level processing failures and the task editor's notification history for individual delivery outcomes.

## Operational behavior

- Each organization is processed in its own tenant RLS context. Suspended and dedicated-database organizations are not dispatched by this pooled-database job.
- Each notification's delivery state is stored in the database, so scheduler invocations can safely overlap and recover stale in-progress attempts.
- Emails use the organization's configured locale and time zone and link directly to the task.
- Manual-send request IDs prevent a repeated request from delivering duplicate emails. A new confirmation creates a distinct manual notification.
- Local development does not need a scheduler. To exercise delivery, use a local-only `CRON_SECRET` and a configured Resend sender/key.

### Dedicated-database limitation

Task creation, assignment changes, and rescheduling trigger an immediate tenant-scoped dispatch, including for dedicated-database tenants. The pooled cron endpoint intentionally skips those tenants, however, so it will not pick up their future scheduled reminders or background retries. A dedicated scheduled dispatcher is required for those follow-up deliveries; until it is configured, do not rely on automatic reminder or retry delivery for dedicated-database tenants.
