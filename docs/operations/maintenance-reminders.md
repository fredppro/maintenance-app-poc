# Maintenance reminder delivery

The application creates one reminder per assigned worker for each scheduled maintenance task. The message is due 24 hours before the task start; tasks created inside that window are due immediately. Cancelled, deleted, completed, or unassigned tasks do not produce pending reminders.

## Configure delivery

1. Configure `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM`.
2. Set `CRON_SECRET` to a random secret generated independently of the auth secret (for example, `openssl rand -hex 32`).
3. Configure the deployment's scheduler to call `POST https://<application-origin>/api/cron/maintenance-reminders` at least hourly with `Authorization: Bearer <CRON_SECRET>`.
4. Keep the secret in the deployment's secret store and the scheduler's protected headers; do not put it in a repository, URL, or scheduler logs.

The endpoint returns aggregate counts only. Invalid credentials receive `401`; missing secret configuration receives `503`. Email failures are recorded per reminder and retried with exponential backoff, capped at five attempts. A stable Resend idempotency key is used across retries. Inspect application logs for organization-level processing failures and the task reminder status for individual delivery outcomes.

## Operational behavior

- Each organization is processed in its own tenant RLS context. Suspended and dedicated-database organizations are not dispatched by this pooled-database job.
- A reminder's delivery state is stored in the database, so scheduler invocations can safely overlap and recover stale in-progress attempts.
- Rescheduling a task before delivery resets its pending reminder. A reminder already sent is not sent again if the task is later edited.
- Local development does not need a scheduler. To exercise delivery, use a local-only `CRON_SECRET` and a configured Resend sender/key.
