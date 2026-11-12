# Application design system

This is the implemented system, not a new visual direction. Build on the local
shadcn/Radix components, with Base UI used by the installed Combobox. Preserve
Geist, the existing background/brand palette, the shell, Inventory tabs, metric
cards, report preview, and maintenance behavior.

## Sources of truth

- [Foundations and Tailwind v4 aliases](../src/styles/globals.css).
- [Class merging](../src/lib/utils.ts): registers the custom spacing, radius,
  and tracking scales, so later variants correctly replace conflicting classes.
- [Shared primitives](../src/components/ui) and
  [page composition](../src/components/app-shell/page-header.tsx).
- [Semantic tone classes](../src/components/ui/semantic-tones.ts) and
  [maintenance status mapping](../src/features/scheduler/ui/task-status-presentation.ts).
- [shadcn configuration](../components.json) points at the actual shared CSS.

Use component props for appearance and `className` for contextual layout:
widths, responsive visibility, placement, alignment, and content flow. Do not
recreate a component's padding, typography, radius, or colors on a page. Add a
reusable named variant when a real recurring purpose requires a difference.

## Audit and decision matrix

The initial runtime usage audit excluded tests and primitive internals:
96 Button usages, 35 Inputs, 15 SelectTriggers, 14 Badges, four Tables, and
20 Cards. Every runtime TSX consumer was inspected, including auth, settings,
uploads, work logs, checklists, notifications, and reporting.

| Component | Before / where used | Inconsistency | After / standard | Variant and decision |
| --- | --- | --- | --- | --- |
| Badge | Inventory, Workers, Sites, checklist progress, equipment counts, sessions, exports, notifications, maintenance | Implicit height; maintenance supplied its own color classes; sent/ready outcomes were neutral | One 24px minimum geometry; shared semantic variants | Retain default/secondary/outline/destructive; consolidate success/warning/info/danger/neutral |
| Badge icons | Selected-worker chips inside a Button | Ancestor Button resized nested badge SVGs to 16px | Badge owns 12px icons; Button sizes only its direct SVG children | Change encapsulation, not labels/removal behavior |
| Status indicators | Scheduler entries, detail toggles, dashboard counts, metrics | Metrics used primary blue for every status | All use the central status-to-tone mapping | Preserve blue/amber/green/neutral task semantics |
| Table surface | Equipment, Inventory stock/planned, Workers | Repeated native wrappers; clipping differed | `TableSurface` owns 8px outer corners, border and clipping | Shared composition helper; retain responsive columns/mobile lists |
| Table headers/rows | All four tables | Row height depended entirely on avatars/actions/content | 40px header, 56px minimum row, shared cell padding | Shared defaults; content can increase row height |
| Numeric cells | Equipment counts and Inventory quantities/costs | Repeated manual alignment; counts sometimes left-aligned | `numeric` on both header and cell | Named prop; preserve formatting and units |
| Table empty rows | Equipment and planned materials search | Duplicated 96px empty cell styling | `TableEmptyRow` with `colSpan` and localized text | Shared composition helper |
| Buttons | All pages | Defaults already coherent; inline helpers overrode sizes | Retain 40/36/44px; use `xs`/`icon-xs` for embedded actions | Add 28px variants; retain standard variants |
| Flexible row action | Mobile Workers and timeline jump action | Local auto-height, wrapping, padding and radius | `size="row"` for content-driven, multiline row actions | Named size; click/keyboard behavior retained |
| Destructive actions | Upload removal, section/worker/organization deletion | Some local destructive colors and blue delete confirmations | Existing destructive variants; AlertDialogAction accepts Button variant | Change appearance only; confirmation logic retained |
| Input | Maintenance, auth, settings, stock, workers | Shared default already coherent; checklist removed border and focus ring locally | Retain default; `variant="inline"` preserves the focus ring | Add inline variant, retain `controlSize` |
| Textarea | Maintenance and forms | Shared 16px radius/80px minimum already correct | Keep existing default | Retain |
| Select/Combobox/search | Forms, global Command, filters | Triggers coherent; option rows smaller than Command items | Retain trigger geometry; options min 36px/44px coarse pointer | Central row minimum; no search logic change |
| Date/time | Maintenance dates | Calendar intentionally denser than form triggers | Keep default trigger and compact time fields; 36px calendar grid | Retain bounded-grid exception |
| Tabs/toggles/groups | Maintenance sheet and Inventory | Geometry already shared; Inventory used a 20px local section gap | Keep concentric 20/16px tabs and connected seams; use section gap | Retain controls; consolidate layout spacing |
| Checkbox/radio/switch | Checklists and installed primitives | Different geometry reflects different purposes | Square checkbox, circular radio, pill switch | Retain; do not make all indicators pills |
| Card | Metrics, onboarding, notifications, auth, settings | Local 12/16/20/24px padding combinations | Default, compact density, sectioned layout | Retain surfaces; add named density/layout |
| Card/dialog titles | Shared headings | `leading-none` compressed wrapped titles | Card 16/24px; dialog 18/24px; sectioned card 14/20px | Shared typography, no page overrides |
| Alert | Dashboard overdue, loading failures, settings | Existing shadcn icon/title/description composition is correct | Keep restrained 8px surface and hierarchy | Retain; no duplicate alerts or test-only actions |
| Empty | Lists, stock, notifications, upload field | Repeated border/padding/layout overrides | Default, surface, inline; compact size | Named variants; canvas and upload behavior documented below |
| Loading | Inventory, workers, notification history | Skeleton and accessible status regions already exist | Keep Skeleton/Spinner and explicit errors/retry | Retain; do not silently substitute empty states |
| Dialog/Sheet/Drawer | Forms, confirmations, worker details | Different placement serves different workflows | Keep accessible titles/focus; default edge panel vs inset maintenance panel | Retain actual primitives and inset Sheet variant |
| Popover/dropdown/tooltip | Selects, Command-based pickers, worksheet menu, row actions | Local destructive menu color bypassed its variant | Shared popover surfaces, semantic destructive menu item | Retain geometry; use existing variants |
| Navigation/page headers | All application pages | Current shell and page width already consistent | Keep PageBody/PageHeader and header Command placement | Retain |
| Attachments | Equipment/logo image upload | Shared attachment states already correct; removal styled locally | Keep Attachment composition; destructive-ghost removal | Retain upload/replace/progress/error behavior |
| Reporting | Worksheet preview and PDF | Preview is intentionally not an ordinary content page | Keep full-height iframe and accessible compact toolbar | Retain; PDF renderer is a separate print medium |

## Foundations

### Color and semantic meaning

Never change a global background to solve a local component inconsistency.

| Role | Light | Dark | Usage |
| --- | --- | --- | --- |
| Background | `#f8fafc` | `#020617` | Existing application canvas and table body |
| Card/popover | `#ffffff` | `#0b1120` | Structural content and elevated selection surfaces |
| Primary | `#1e60ed` | `#1e60ed` | Main actions and current selection; not every status |
| Muted/secondary | `#f1f5f9` | `#172033` | Subordinate surfaces; pair with foreground tokens |
| Info tone | `#1d4ed8` | `#60a5fa` | Scheduled, pending, informational |
| Warning tone | `#92400e` | `#f59e0b` | In progress, sending, low-stock attention |
| Success tone | `#166534` | `#22c55e` | Completed, sent, ready |
| Danger tone | `#b91c1c` | `#f87171` | Failed/error status on a tinted surface |
| Neutral tone | `#475569` | `#cbd5e1` | Cancelled or unknown display status |

`--tone-*` is the foreground-safe status family. Semantic badges use 12% tone
background and 30% border. The existing `--success`, `--warning`, `--info`,
`--destructive` and their foreground tokens remain available for other
established component surfaces. Do not confuse a filled destructive Badge
with a routine warning.

Maintenance aliases are `--status-scheduled` -> info, `--status-in-progress` ->
warning, `--status-completed` -> success, and `--status-cancelled` -> neutral.
Use `getTaskStatusPresentation`, not a new local status map. Task type does not
determine its state color. Unknown display statuses are neutral, not primary
blue. This does not change validation or the supported business statuses.

### Typography

Use Geist/Geist Fallback and the installed Geist Mono family; no new font
dependency. Body defaults are 16px/24px, while operational UI is mainly
14px/20px. `--letter-spacing-ui` is `-0.015em`.

| Purpose | Size / line-height | Weight |
| --- | --- | --- |
| Page title | 20/28px, 24/32px from `sm` | 600, tight tracking |
| Dialog title | 18/24px | 600 |
| Section heading / empty title | 18/28px | 600 / 500 |
| Card title / Sheet title | 16/24px | 600 |
| Sectioned card title / field label | 14/20px | 600 / 500 |
| Controls, tables, main UI | 14/20px | 400; actions 500 |
| Descriptive copy | 14px, relaxed line-height | 400, muted foreground |
| Badge / metadata | 12/16px | 500 / 400 |
| Metric values | 30/36px | 600, tabular numerals |

Editable inputs use 16px below `md` to avoid mobile browser zoom, and 14px from
`md`. Dates, durations, amounts and counts use `tabular-nums` when aligned for
comparison. Do not uppercase ordinary labels or introduce arbitrary 10/11/13px
operational text. Headings wrap naturally; avoid clipping important titles.

### Spacing, sizing and layout

Use the existing 4px Tailwind spacing foundation. Semantic aliases communicate
purpose; equivalent ordinary Tailwind values are not a second spacing system.

| Token | Value | Purpose |
| --- | --- | --- |
| `--field-gap` | 8px | Label/control/hint relationships |
| `--form-gap` | 16px | Related fields and compact card sections |
| `--section-gap` | 24px | Page sections and default Card gap |
| `--page-padding` / `--page-padding-desktop` | 16 / 24px | PageBody, increasing from `sm` |
| `--content-width-form` | 768px maximum | Explicit, left-anchored settings/form regions |
| `--control-padding` | 14px | Input/select horizontal padding |
| `--control-height` | 40px | Standard control |
| `--control-height-sm` | 36px | Deliberately compact form/toolbar control |
| `--control-height-xs` | 28px | Embedded action, not the primary page CTA |
| `--control-height-lg` | 44px | Large control/coarse-pointer target |
| `--badge-height` | 24px minimum | All Badge variants |
| `--table-row-height` | 56px minimum | Operational table rows |
| `--table-cell-padding` | 16px | Horizontal header and cell inset |

PageBody fills the available shell width without a maximum width or automatic
horizontal margins. Use 16px gaps inside related groups and 24px between
sections. Readable forms use the explicit PageRegion contract below, not
page-specific width caps. Inventory retains stock/planned tabs.

### Responsive layout and grid

The shared primitives live in
[page-header.tsx](../src/components/app-shell/page-header.tsx).
The shell owns the sidebar and scrollable main workspace; pages must not
subtract sidebar widths themselves or introduce another centered container.

#### Viewport breakpoints

Use the existing Tailwind v4 default scale, without local overrides or an
additional viewport breakpoint system:

| Range / minimum width | Intended behavior |
| --- | --- |
| Base, below 640px | Mobile; 16px page/header gutters; actions can wrap |
| `sm`, 640px / 40rem | Large mobile/small tablet; gutters become 24px |
| `md`, 768px / 48rem | Persistent sidebar replaces the mobile overlay |
| `lg`, 1024px / 64rem | Standard page heading/actions can share a row |
| `xl`, 1280px / 80rem | Large desktop; same fluid left/right boundaries |
| `2xl`, 1536px / 96rem | Extra-wide desktop; same fluid boundaries |

1200px, 1440px, 1600px, 1920px and ultra-wide screens do not activate new
centering rules. The mobile hook uses the same 768px boundary as `md`.
The existing sidebar remains 256px expanded, 48px collapsed, and a 288px
overlay below `md`; its actual occupied width determines the main workspace.

#### Containers and alignment

- **PageBody:** `w-full`, `min-w-0`, no `max-width` or `mx-auto`; 16px padding
  below `sm`, 24px from `sm`, and 24px section gaps. Titles, full-width tables,
  tabs, filters and panels share these content boundaries.
- **Shell header:** uses the same horizontal padding tokens. Its navigation
  and controls remain separate from page-level content. Its named `shell`
  container keeps search icon-only below 576px of available header content,
  then uses 176px from `@xl/shell`, 224px from `@2xl/shell` (672px), and 288px
  from `@5xl/shell` (1024px). Long site/context labels must not push locale
  or theme controls outside the header. Search retains a 44px minimum touch
  target without forcing its expanded text trigger to an icon-only width.
  Noninteractive site labels can shrink and truncate to preserve control space.
- **PageHeader:** title/description and wrapping actions. The default stacks
  below `lg`; `layout="compact"` keeps the scheduler's compact operational
  heading. Text descriptions may use `max-w-prose` without narrowing the page.
- **PageRegion:** a full-width local region by default. `width="form"` caps
  it at `--content-width-form` (768px) without centering. Put both the region's
  heading and its cards inside it. Organization, Members and Account use this
  explicit readability exception.
- **Workspace:** `PageBody layout="workspace"` retains the scheduler's full
  height, minimum-height guards and internal vertical scrolling. The timeline
  may scroll horizontally inside its canvas; the document must not.

With an expanded sidebar, content starts at x=280px on every viewport at or
above `md` (256px sidebar + 24px gutter). Collapsing the sidebar changes that
to x=72px. On mobile it starts at x=16px, or x=24px from `sm`. Full-width
content ends one gutter before the workspace's right edge. Scrollbars can
consume their normal width; no independent centering offset is added.

#### Columns, gutters and spans

PageBody and PageRegion establish the named `page` inline-size container.
PageGrid uses Tailwind's existing container-query scale, so columns respond to
the space left by the sidebar rather than only the viewport:

| Available region content width | PageGrid columns |
| --- | --- |
| Below 672px | One full-width column |
| At least 672px / `@2xl/page` | Two equal `minmax(0, 1fr)` columns |
| At least 1152px / `@6xl/page` | Three equal `minmax(0, 1fr)` columns |

Grid gutters are `gap-section` (24px) in both axes. Panel width is the
available width minus gutters, divided equally among the active columns.
Use spans for deliberate composition: Metrics' last chart spans two tracks
in the two-column layout, then one track in the three-column layout.
Its compact KPI grid uses two columns below 576px of page content, and four
from Tailwind's `@xl/page` threshold. These queries change columns, never the
outer content alignment.

Embedded FieldGroups, work logs, checklists and material rows keep their
existing purpose-built field grids and 16px form gaps. They are component
layouts, not independently centered application containers.

#### Page-by-page consolidation

| Area | Previous layout | Implemented contract |
| --- | --- | --- |
| Dashboard / scheduler | Separate fluid outer wrapper | Shared workspace PageBody and compact PageHeader |
| Equipment | Centered 1152px cap | Fluid PageBody; search width remains component-bounded |
| Workers | Centered cap, custom loading/table/mobile layouts | Fluid PageBody; preserve table/mobile-list and drawer behavior |
| Inventory | Centered cap | Fluid PageBody; retain aligned tabs, filters and both tables |
| Sites | Centered cap | Fluid PageBody; short add-site/section forms keep useful field widths |
| Metrics | Centered cap and viewport-only two-column cards | Fluid PageBody; container-responsive PageGrid and KPIs |
| Organization settings | Centered page plus independent 672px form cap | Left-anchored form PageRegion, including heading |
| Organization members | Centered page plus independent 768px feature cap | Form PageRegion at the page boundary; feature fills it |
| Account security | Centered page plus independent 768px inner wrapper | Form PageRegion at the shared left edge |
| Maintenance add/edit/details | Bounded inset Sheet | Preserve intentional overlay geometry and mounted tabs |
| Work logs / checklists / notifications | Embedded maintenance sections | Inherit the Sheet region; preserve local field composition |
| Attachments / equipment editing | Bounded upload field and Sheet | Preserve component constraints; no page-level centering |
| Report preview | Independent header/viewer gutters | Same 16/24px gutters; standalone full-height PDF workspace |
| Auth / onboarding | Centered, bounded unauthenticated forms | Retain intentional non-shell composition |

#### Implementing a page

```tsx
<PageBody>
  <PageHeader title={title} actions={<Button>{action}</Button>} />
  <PageGrid>
    <Card>{/* composed card slots */}</Card>
    <Card>{/* composed card slots */}</Card>
  </PageGrid>
</PageBody>
```

For readable settings, put `PageHeader` and the form/card stack inside
`<PageRegion width="form">` within PageBody. Do not put `mx-auto`, `max-w-6xl`
or another container wrapper around ordinary application pages. Search fields,
short forms, text descriptions and overlays can retain component-level width
limits; they must not move the enclosing page's left boundary.

### Radius, borders and elevation

| Category | Radius | Reason |
| --- | --- | --- |
| Standard controls, outer tabs | `rounded-control`, 20px | Interactive geometry |
| Compact controls, textarea, inset tab triggers | `rounded-control-sm` / `rounded-control-inner`, 16px | Concentric inset and compact proportions |
| Card | `rounded-xl`, 12px | Restrained structural surface |
| Table surface, Alert, Empty, Attachment | `rounded-lg`, 8px | Grouped information |
| Popovers, menus, badges, navigation, task entries | `rounded-md`, 6px where specified | Small structural/metadata surfaces |
| Menu options, checkbox | `rounded-sm`, 4px | Nested indicators/items |
| Radio/switch/avatar/progress | Fully rounded | Shape communicates function |
| Inset maintenance Sheet | 24px at desktop, flush on mobile | Explicit `variant="inset"` exception |

Tables have one outer radius on TableSurface, not separately rounded rows or
cells. Do not nest cards merely to add borders. Use dividers for related
sections. Default Card uses a subtle shadow; technical cards have none;
elevated cards and overlays use the existing stronger shadow variants.

## Component contracts

### Badge

Use [Badge](../src/components/ui/badge.tsx) for short classifications, counts,
and states, not paragraphs or every piece of metadata.

- Minimum height 24px; horizontal padding 8px, vertical padding 2px.
- Radius 6px; 12/16px medium text, UI tracking; 4px icon/text gap.
- Direct SVG icons are 12px and do not shrink. Parent buttons must not resize
  them. Badge text is single-line; truncate long content inside a child span
  and preserve the full accessible text.
- `default`: primary emphasis/current site. `secondary`: quiet grouping.
  `outline`: classification such as internal/external worker or maintenance type.
- `success`, `warning`, `info`, `danger`, `neutral`: shared semantic tones.
  `destructive`: filled urgent destructive emphasis, not low-stock metadata.
- Noninteractive badges are not focusable. `asChild` supports a semantic
  interactive element; it retains the shared focus/invalid styles.
- Hover is defined for linked primary/secondary/outline variants. Do not add a
  fake hover state to a static label or use color as the only state label.

### Buttons and groups

Use [Button](../src/components/ui/button.tsx), not styled native substitutes.
Default 40px; `sm` 36px; `lg` 44px; `xs` 28px. Corresponding `icon`, `icon-sm`,
`icon-lg`, `icon-xs` sizes are square. Coarse-pointer compact actions grow to
44px. Text is 14/20px medium, except `xs` at 12px.

- Primary page action: default. Secondary/cancel: outline. Low-emphasis action:
  ghost. Danger actions: destructive, destructive-outline or destructive-ghost.
- `size="row"`: auto height, minimum 40px, 8px padding, 12px gap, restrained
  6px corners, wrapping text; use for an actionable list row, not a page CTA.
- Icons are direct children, preferably marked `data-icon`. Icon-only controls
  need an accessible name; IconButton requires one.
- Connected ButtonGroup/ToggleGroup owns internal seams. Use components and
  size props, not individually rounded/padded buttons.
- Keep focus ring, disabled, busy and selected feedback. Compose Spinner and
  disabled/aria-busy for asynchronous actions. A busy appearance is not success.
- AlertDialogAction accepts the same variant prop; explicitly destructive
  confirmations use `variant="destructive"`.

### Forms and selection

Input, SelectTrigger, SearchableSelect and InputGroup use the 40px/20px
foundation. Use `controlSize="sm"` on Input/InputGroup and `size="sm"` on
select/button-based triggers, not local `h-*` overrides. Textarea has a 16px
radius, 80px minimum height and grows with content.

Use FieldGroup/Field/FieldLabel/FieldDescription/FieldError, with linked IDs.
Errors use `data-invalid` and `aria-invalid`; disabled controls keep their
disabled state. Labels use 14/20px, not tiny uppercase captions. `Input
variant="inline"` is for checklist editing inside an existing row; it removes
the redundant visible border but retains the shared focus ring.

InputGroup owns the border/radius; use InputGroupInput and InputGroupAddon.
Combobox and MultiSelect own their wrapping/chip composition. Menu, Select,
Combobox and Command option rows have minimum 36px heights (44px on coarse
pointers), with 4px inner corners and standard keyboard/disabled states.

Tabs use a 40px/20px outer list with 4px inset and 16px triggers. Triggers must
be inside TabsList. Maintenance panels remain mounted while inactive so draft
fields survive tab changes; validation selects/focuses the affected panel.
Checkboxes remain 16px squares, radios 16px circles, switches compact pill
tracks; associate them with labels rather than restyling them per page.

### Tables

Compose [TableSurface + Table](../src/components/ui/table.tsx), a caption
(visually hidden if redundant), TableHeader/Body/Row/Head/Cell. Surface owns
border/radius/clipping, Table owns horizontal overflow.

- Header 40px, body rows minimum 56px; both allow content growth.
- Header/body use the existing muted/background tokens. Cells use 16px
  horizontal and 8px vertical padding, 14/20px text.
- Use `numeric` on corresponding headers and cells for right alignment and
  tabular figures. Action headers have accessible names; actions align right.
- `TableEmptyRow colSpan={...}` shows a 96px empty row with localized text.
  Loading uses Skeleton and an accessible status label, not a fake data row.
- Preserve responsive hidden columns and their useful mobile summaries.
  Workers deliberately use actionable mobile list rows.
- Hover is muted, selected rows use muted fill. Focusable actionable rows use
  an inset focus outline and explicit Enter/Space handling; ordinary rows do
  not become focusable automatically.
- No table currently needs pagination; do not add it as decorative UI.

#### Optional row reordering

Table remains a shadcn semantic table. Reordering is off unless a controlled
`reordering` configuration is supplied with `enabled: true`, ordered string
`items`, `getItemLabel(id)` and `onReorder(ids)`. Add `reorderId` to body
TableRows and put TableDragHandle in a dedicated column. Header, empty and
ordinary rows do not register as sortable items. Set `enabled: false` to
disable dragging and remove the handles without changing the table markup.
An unfinished drag cannot commit after disabling or unmounting the region.

```tsx
<TableSurface>
  <Table reordering={{ enabled, items: rowIds, getItemLabel, onReorder }}>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.id} reorderId={row.id}>
          <TableCell><TableDragHandle /></TableCell>
          <TableCell>{row.name}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableSurface>
```

The shared [Reorderable core](../src/components/ui/reorderable.tsx) also
supports native lists through ReorderableItem's `asChild`-style Slot composition
and ReorderableHandle. Keep desktop/mobile representations in separate
contexts, controlled by the same ordered data, so hidden duplicate rows cannot
become drop targets. Existing dnd-kit sensors provide mouse, delayed touch and
sortable keyboard interaction. Handles stop clicks and initial key activation;
row keyboard actions must ignore descendant targets so active keys can reach
the document-level sensor. Handles retain 44px coarse-pointer targets and own touch gestures; row content remains
scrollable and actionable. Instructions and live announcements are localized.
Tracking has no transform transition or decorative settling animation.

Workers enables this capability in both layouts. Its order is deliberately
local to the mounted view and resets on refetch, as before; dragging does not
write to the database or change scheduler worker data. Persisting order is a
separate product/data decision. When adding filtering, sorting or pagination,
define the reorder scope explicitly rather than reordering an unrelated full
dataset from visible row indices.

### Cards and feedback surfaces

Card defaults: 12px corners, 24px vertical padding/section gap and horizontal
slot padding. Use CardHeader/Title/Description/Content/Footer/Action.
Surface variants remain `default`, `technical`, and `elevated`.
`density="compact"` uses 16px padding/gaps for onboarding and metric summaries.
`layout="sectioned"` uses a divided, lightly muted 16px-padded header and 16px
content padding; use it for the maintenance notification panel or static auth
preview, not a pile of nested cards.

Empty defaults are unframed for use within a parent. `variant="surface"` is a
standalone bordered page state; `variant="inline"` is a compact horizontal
notice. `size="sm"` is for embedded history/invitations/upload areas. Use
EmptyHeader/Media/Title/Description/Content; icons must explain the state.

Alert uses direct SVG + AlertTitle + AlertDescription. Keep the existing
compact overdue alert and one meaningful review action. Do not add test links,
duplicate task lists or success-shaped error fallbacks. Loading, no data, no
matches, and errors are different states.

### Overlays, navigation and special surfaces

Dialog/AlertDialog, Sheet and Drawer retain their actual accessible primitives,
titles, focus management and Escape/cancel behavior. Use the existing inset
maintenance Sheet rather than independently styling each form. Popovers and
menus own their borders, elevation and collision behavior. Use a destructive
menu item variant rather than a local text-color override. Tooltips explain
controls, never replace an accessible control name.

Maintenance Sheet footers wrap action groups on narrow screens; keep delete,
cancel and save controls visible rather than shrinking or clipping them.

Header maintenance search uses the installed Command and the same store query
and matcher as the timeline. It precedes the locale switcher, adapts to an icon
in compact headers, shows Cmd+K/Ctrl+K when expanded, and keeps keyboard selection, empty, clear,
Escape and focus-return behavior. It must not stack over an editing dialog.

Attachment/Media/Content/Title/Description/Actions retain explicit idle,
processing, uploading, error and done states. Preserve upload/replace/remove
behavior, file validation, progress and keyboard access. Notification items use
Item composition; delivery-state labels use shared semantic Badge variants.

## Intentional exceptions

These are component-owned, not permission to override an ordinary Badge or
Button on a page:

1. [MaintenanceEntryBlock](../src/features/scheduler/ui/maintenance-entry-block.tsx)
   owns restrained corners, duration-driven canvas geometry and drag feedback.
   The status mapping supplies its color; its width/height are not form sizes.
2. [MaintenanceSearch](../src/components/app-shell/maintenance-search.tsx)
   composes a responsive input-like Button, shortcut hint and unpadded Command
   dialog. Its responsive width/padding is intentional shell layout.
3. [TimelineGrid](../src/features/scheduler/ui/timeline-grid.tsx) owns time-axis
   cells, row heights and a borderless empty canvas. Do not force this into a
   table/card grid or apply those dimensions to ordinary controls.
4. Calendar navigation/days stay 36px even on coarse pointers so seven columns
   and collision padding fit a 320px viewport. Date triggers/time fields still
   use shared control sizes.
5. MultiSelect chips and Base UI combobox chips are selection affordances;
   preserve their remove/selection behavior and wrapping. The surrounding
   shared component owns geometry, never its caller.
6. [ImageUploadField](../src/features/files/ui/image-upload-field.tsx) owns
   dashed drop-target, drag and error cues around shared Empty/Attachment
   composition. Other empty states must use the named variants.
7. Application pages use the available shell width; form regions are explicitly
   constrained and left-anchored. PDF preview uses the viewport workspace with
   the same gutters. Auth forms are bounded to `max-w-md`; the desktop auth
   illustration uses 10px miniature timeline labels, not operational controls.
   Server PDF generation uses point-based print typography, not browser CSS.

No motion system or new dependencies were introduced by this consolidation.

## Enforcement and verification

- [Component contracts](../src/components/ui/design-system.test.tsx) cover
  shared badge geometry, tones, explicit variants, table semantics and actions.
- [Usage contracts](../src/lib/design-system-usage.test.ts) scan runtime TSX
  with the installed TypeScript parser: no arbitrary page-level Badge/control/
  table geometry or native page-region width caps/centering; all four tables
  compose TableSurface. The two Button
  exceptions above are explicitly scoped.
- [Page layout contracts](../src/components/app-shell/page-header.test.tsx)
  cover fluid containers, explicit form bounds, workspace sizing, shared
  gutters and container-responsive columns. Browser checks must also measure
  actual page/title/panel boundaries at 375, 768, 1024, 1200, 1440, 1600,
  1920 and ultra-wide widths, including expanded/collapsed/mobile sidebars.
- Existing scheduler status, search, draft, work-log, upload, notification and
  reporting tests continue to validate functionality.
- Run `pnpm test:run`, `pnpm typecheck`, `pnpm lint`, and the production build.
  Validate rendered geometry and contrast in a browser: jsdom class assertions
  do not prove pixel sizes, overflow or contrast.
- Review desktop/mobile and light/dark, keyboard focus, disabled/selected,
  empty/loading/error, long translated labels, and popover collision handling.
  A new justified exception requires a documented purpose and a regression
  test; do not broaden the usage-test allowlist to hide styling drift.
