# Baseline audit (Phase 0)

Starting point for the next phase: the organization-wide maintenance view, a layout/translation sweep, PDF
alignment, upload documentation and a code review. Nothing in the application was changed to produce this
document.

- **Baseline:** commit `fae7de6` on `feature/MAINPOC-14-saas`, 2026-10-11.
- **Method:** reading the code and migrations, mechanical scans (translations, hardcoded strings, query
  patterns, server entry points), one measured page render, the existing coverage report, and two read-only
  deep dives (PDF, uploads) whose key claims were re-verified.
- **Not done in this pass:** a visual/accessibility sweep in a browser, a Portuguese language review, and load
  testing. Those belong to Phase 2 and Phase 5.

## 1. What exists today

**Routes.** `/` (Schedule timeline), `/metrics`, `/equipment`, `/sites`, `/inventory`, `/workers`, `/members`,
`/organization` (settings, export, deletion). There are **no detail pages**: equipment and tasks are edited in
dialogs, and a report preview exists at `/reports/preview/[id]`.

**Data model.** `Organization → Site → Equipment → MaintenanceTask`; tasks have workers
(`MaintenanceTaskAssignment`) and `Material`s. Tenant tables carry `organizationId`, composite foreign keys
and row-level security. Equipment, tasks and workers are soft-deleted.

**Facts that shape the overview (verified):**

| Question | Answer |
|---|---|
| Are there recurring plans? | **No.** Every `MaintenanceTask` is one dated occurrence (`startTime`, `endTime`). Nothing generates occurrences. |
| What is "status"? | A free `String`, default `scheduled`. The UI uses `scheduled`, `in-progress`, `completed`. The server accepts **any non-empty string** (`schemas.ts:33,54`). |
| Is "overdue" stored? | No. It must be derived: open (not `completed`) and `endTime` in the past. |
| Is "unscheduled" stored? | No. Derived: equipment with no open task from now on. |
| Per-site permissions? | No. Any member with `viewMaintenance` sees every site of the organization. |
| Useful index? | `@@index([organizationId, startTime])` on tasks; equipment has `[siteId, organizationId]`. |
| Which time zone? | The scheduler UI uses the browser's; the organization time zone only affects PDF dates. |

## 2. Findings register

Severity reflects impact on this product today. "Phase" is where the fix belongs.

### High

| ID | Area | Finding | Evidence | Recommended fix and regression test | Phase |
|---|---|---|---|---|---|
| R1 | PDF | **Every organization's report is issued under a hardcoded identity** ("MANUSIST", "Manusist, Lda.", NIF 500 123 456, a Lisbon address, email and phone, which look like placeholders). | `pdf/renderer.ts:44-76`; footer text in `PDF.generatedBy` | Issue the report in the organization's name, contact details and logo (all now in Organization Settings); keep only a product line in the footer. Address and tax id are not in the model: decide whether to add them. Test: the PDF contains the organization name and not "MANUSIST". | 3 |
| R2 | PDF | **No pagination safety.** Worker and material rows advance by a fixed 16 pt with no page check, so long lists run over the footer or off the page. Column headers are not repeated. The signature block uses fixed coordinates. | `renderer.ts:263-296, 342-381, 459-468`; the only test checks "more than one page" (`stream.test.ts:117-158`) | Page-aware layout primitives (table, key/value block, footer). Test: per-page row positions never cross the footer, headers repeat, with 1, 40 and 200 rows. | 3 |
| D1 | Data | **Task status is unconstrained**, so any `manageMaintenance` user can store an arbitrary status. Metrics and any overview filter would silently mishandle it. | `schemas.ts:33,54` | Validate with an enum (`scheduled`, `in-progress`, `completed`) now; add a database check constraint later. Test: unknown status is rejected. **Prerequisite for Phase 1.** | 1 |
| P1 | Performance | **Every dashboard page loads the whole site's equipment, tasks (full history, three nested includes), sections and workers, and each loader re-resolves the tenant context.** Measured on an *empty* organization: **67 to 86 SQL statements per page navigation**, 11 to 15 of them separate tenant transactions (`BEGIN`, `set_config`, query, `COMMIT`). The `/members` page loads tasks it never shows. | `(app)/layout.tsx`, `scheduler/server/actions.ts:28,333-352`; no `cache()` around `getTenantContext` | Resolve the tenant context once per request (React `cache`); load only what a page needs; load tasks for a visible date window. Test: a query-count budget per render. | 1, 5 |

### Medium

| ID | Area | Finding | Evidence | Fix and test | Phase |
|---|---|---|---|---|---|
| S1 | Security testing | `tenant-context.ts` (permission, inactive tenant and site resolution) has **8% unit coverage**; isolation is proven by e2e and the RLS integration test, not by unit tests of each branch. `auth.ts` is at 22%. | coverage report | Unit tests for no session, no organization, not a member, suspended, permission denied, no site, bad site cookie, single site. | 5 |
| S2 | Authorization | No per-site authorization. An organization-wide overview widens what every role can see at once. | `getAvailableTenantContexts` | Confirm this is intended before building; if not, a site-membership model is a separate, larger change. | 1 (decision) |
| S3 | Uploads | `POST /api/files` buffers the whole request before the real size check when `Content-Length` is missing or understated. Authenticated and rate limited (30 per minute). | `api/files/route.ts:21-24`, `files.ts:45-48` | Enforce a byte cap while reading the stream. Test: absent and forged lengths with an oversized body. | 4 |
| F1 | Uploads | **No orphan cleanup.** Files uploaded but never saved, failed storage deletes and failed cleanup after a database error stay forever. They are private and tenant-keyed, so this is cost and hygiene, not exposure. | `files.ts:56-88`, `retention.ts` (exports only) | Add an orphan sweep to `ops:retention` (rows unreferenced by equipment or logo and older than a day). Test: abandoned upload is reclaimed, referenced files are not. | 4 |
| D3 | Data | Soft-delete filtering only applies to the queried model, not nested includes (for example a trashed worker inside `assignments.worker`). | `prisma.ts` `hideTrashed`; documented limit | Filter explicitly in the overview query and add a regression test. | 1 |
| D4 | Data | Time boundaries ("today", "due soon", "overdue") have no agreed time zone. | scheduler uses the browser's | Compute them in the organization's time zone. | 1 (decision) |
| R3 | PDF | Only built-in Helvetica. Portuguese accents render, but names with other scripts or symbols do not. The app font is not embedded. | `renderer.ts:44-52` | Embed a Unicode-capable font. Test with a non-Latin name. | 3 |
| R4 | PDF | Hardcoded slate palette and an orange status that matches no token. | `renderer.ts:24-123, 188-196` | A single `pdf/theme.ts` mapped to the design tokens. | 3 |
| U1 | UI | The Workers page builds its own heading and card-in-card container instead of `PageHeader`/`PageBody`, so margins and alignment differ from the other pages. | `WorkerManagementPage.tsx:411-414` | Use the shared layout components. | 2 |
| U2 | UI | Native `window.confirm` (three places) and `alert()` (one) while the rest of the app uses `AlertDialog` and toasts. | `member-administration.tsx:199,239,316`, `CreateUpdateUser.tsx:79` | Replace with `AlertDialog` and toast. Test the confirm flows. | 2 |
| P2 | Performance | Each tenant query is its own transaction, so a page issues many round trips (see P1). | `prisma.ts` `createTenantClient` | Batch a page's reads in one `db.transaction`. | 5 |

### Low

| ID | Area | Finding | Fix | Phase |
|---|---|---|---|---|
| U3 | UI | `space-x`/`space-y` utilities in 3 files, against the project's `gap` rule. | Replace with `flex` and `gap`. | 2 |
| U4 | i18n | Dates formatted without the app locale: `WorkerManagementPage.tsx:323`, `member-administration.tsx:304`, `calendar.tsx:40`. | Use the locale-aware helpers. | 2 |
| R5 | PDF | Price uses `toFixed(2)`; unit `PC`, `N/A` and the duration format are hardcoded. | Locale-aware formatting and translated labels. | 3 |
| F3 | Uploads | The database row is deleted before the object, so a failed object delete is logged with an id but the key is gone. | Log the key, or mark for retry. | 4 |
| F4 | Uploads | Organization purge deletes rows, then objects; a partial failure leaves unlisted objects. | Write the keys to the log before deleting. | 4 |
| S5 | Reliability | The rate limiter fails open (a deliberate choice). | Document it and alert on `rate_limit.failed`. | 5 |
| P4 | Performance | The data export loads every table into memory (rate limited, 7-day retention). | Stream or page it if tenants grow large. | 5 |

### Checked and found sound

- Every server action and API route has a permission guard; the three that only check the session verify
  membership inside. Raw SQL is limited to parameterized health, privacy and rate-limit queries. No tenant
  table is touched through the plain client.
- Translations: **538 keys in both locales, none missing, no placeholder mismatches**. Only 5 candidate unused
  keys (the "17 unused" PDF keys are read as properties, a false positive). No hardcoded `aria-label`,
  `placeholder`, `title` or toast strings were found.
- Uploads: files are validated by their bytes (PNG, JPEG, WebP only, so no SVG/HTML), keyed
  `organizationId/uuid`, read only through an authenticated, tenant-scoped route with `nosniff`, with
  same-tenant database triggers on both references.
- Reports: tenant and site scoped, rate limited, organization time zone applied.

## 3. Phase 1 design notes: organization-wide maintenance view

**Derived states** (open means `status != completed`; "now" is in the organization time zone):

| State | Rule |
|---|---|
| Overdue | open and `endTime < now` |
| In progress | `status = in-progress` |
| Due soon | open, not overdue, `startTime` within the next N days (default 7) |
| Upcoming | open and later than due soon |
| Completed | `status = completed`; never counted as upcoming |
| Unscheduled | equipment with no open task from now on |

There are no recurring plans, so a task is always one occurrence and nothing needs de-duplicating. If recurrence
is ever added, it needs a plan/occurrence split first.

**Query shape.** Server-side only, through the tenant client, with `organizationId` in every `where`:
1. one grouped count per site and state (cheap, drives the summary cards);
2. a cursor-paged task list ordered by due date, filtered by site, equipment, status and due window, with
   `deletedAt: null` stated explicitly on equipment and tasks;
3. unscheduled equipment as a separate paged query.
Filters go in the URL so views are linkable, and the organization always comes from the session.

**Decisions needed before building:**
1. **Drill-down.** No detail pages exist. Options: link to the Schedule at the task's date after switching site,
   or add a `?task=<id>` deep link that opens the existing edit dialog. I recommend the deep link.
2. **Who sees all sites?** Today every member does. Confirm that is acceptable (S2).
3. **Due-soon window** (7 days?) and using the organization time zone (D4).
4. **Where it lives.** A new "Overview" item at the top of the Operations navigation group, rather than inside
   the Organization settings page.

**Acceptance criteria** (from the roadmap, made testable): results are restricted to the session's
organization on the server; changing a filter or a cursor cannot cross that boundary (test with two
organizations); empty sites and empty organizations render explicit empty states; overdue, due soon, upcoming
and completed are classified as in the table; a page of results issues a bounded number of statements
regardless of organization size; both locales.

## 4. Prioritized backlog

| Order | Work | Estimate | Main files likely to change |
|---|---|---|---|
| 1 | D1 status enum, tenant context `cache()` (part of P1) | 0.5 day | `scheduler/server/schemas.ts`, `lib/tenant-context.ts` |
| 2 | Phase 1: overview (summary, filtered list, empty and error states, tests) | 3-4 days | new `features/overview/**`, `nav.ts`, one new page, messages, e2e |
| 3 | Phase 2 sweep: U1-U4 plus an axe pass over every page in both locales | 1-3 days | `WorkerManagementPage.tsx`, `member-administration.tsx`, `CreateUpdateUser.tsx`, `calendar.tsx` |
| 4 | Phase 3: R1-R5 (organization identity first, then pagination primitives, font, theme) | 2-3 days | `report/pdf/*`, `report.service.ts`, messages |
| 5 | Phase 4: upload document, S3, F1, F3, F4 | 1-1.5 days | `files.ts`, `api/files/route.ts`, `retention.ts`, `docs/uploads.md` |
| 6 | Phase 5: S1, P1 (windowed tasks), P2, S5, final regression run | 1-3 days | `tenant-context.test.ts`, layout, scheduler actions |

## 5. Test baseline

| Suite | Command | Result at baseline |
|---|---|---|
| Unit | `pnpm test:coverage` | 59 files (1 skipped), 371 tests (12 skipped: the RLS suite without a database); lines 52.4%, branches 44.7%, functions 45.7% |
| RLS integration | `pnpm test:rls` | 12 of 12 |
| Browser | `pnpm test:e2e` | 13 of 13 (development mode) |
| Static | `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |

**Gaps:** the timeline grid and entry block have 0% unit coverage and rely on e2e; there is no accessibility
test beyond one axe check on the schedule dialog; PDF layout is not asserted; no test counts queries;
production-only behavior (secure cookies, rate limits, required verification) is not covered by browser tests.

## 6. Upload data flow (summary for Phase 4)

```text
Session -> POST /api/files
  -> manageMaintenance + rate limit (30 per minute per user)
  -> read multipart bytes
  -> magic-byte type check (PNG/JPEG/WebP) + 5 MiB limit
  -> storage.put("<organizationId>/<uuid>.<ext>")      S3-compatible, or local disk in development
  -> StoredFile row (organizationId from the session)
  -> client receives the file id
  -> equipment.imageFileId / tenant_settings.logoFileId reference it (same-tenant trigger)
  -> GET /api/files/:id -> viewMaintenance + tenant-scoped lookup -> storage.get -> private, inline, nosniff
```

Replacement and removal delete the old row and object after the new reference is saved. A logo is not deleted
if equipment still uses the file. Organization purge removes rows and objects. Full document: Phase 4.
