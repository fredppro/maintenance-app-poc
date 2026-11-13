"use client";

import { Box, CalendarDays, Pencil, Plus, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableDragHandle,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
  TableEmptyRow,
  type ReorderingOptions,
} from "@/components/ui/table";
import {
  Reorderable,
  ReorderableHandle,
  ReorderableItem,
  mergeVisibleReorder,
} from "@/components/ui/reorderable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { summarizeEquipmentMaintenance } from "@/features/scheduler/utils/insights";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import type { Equipment } from "@/features/scheduler/types";
import { EquipmentThumbnail } from "@/features/scheduler/ui/equipment-thumbnail";
import { EquipmentDialog } from "@/features/scheduler/ui/equipment-dialog";
import { Link } from "@/i18n/routing";

export function EquipmentPageClient() {
  const t = useTranslations("EquipmentPage");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const equipment = useSchedulerStore((s) => s.equipment);
  const entries = useSchedulerStore((s) => s.entries);
  const sections = useSchedulerStore((s) => s.sections);
  const timeZone = useSchedulerStore((s) => s.timeZone);
  const [query, setQuery] = useState("");
  const [equipmentOrder, setEquipmentOrder] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);

  const categories = useMemo(
    () => [
      ...new Set(equipment.map((e) => e.category).filter(Boolean) as string[]),
    ],
    [equipment],
  );

  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return equipment
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.category?.toLowerCase().includes(q),
      )
      .map((e) => ({
        equipment: e,
        section: sections.find((s) => s.id === e.sectionId)?.name,
        ...summarizeEquipmentMaintenance(e.id, entries, now),
      }));
  }, [equipment, entries, sections, query, now]);
  const orderedRows = useMemo(() => {
    const order = new Map(equipmentOrder.map((id, index) => [id, index]));
    return [...rows].sort(
      (a, b) =>
        (order.get(a.equipment.id) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(b.equipment.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [equipmentOrder, rows]);
  const reordering = useMemo<ReorderingOptions>(() => ({
    enabled: true,
    items: orderedRows.map((row) => row.equipment.id),
    getItemLabel: (id) =>
      equipment.find((item) => item.id === id)?.name ?? id,
    onReorder: (visibleOrder) => {
      setEquipmentOrder((current) =>
        mergeVisibleReorder(
          equipment.map((item) => item.id),
          current,
          visibleOrder,
        ),
      );
    },
  }), [equipment, orderedRows]);
  const tReordering = useTranslations("Reordering");

  const fmt = (d?: Date | string) =>
    d
      ? format.dateTime(new Date(d), { dateStyle: "medium", timeZone })
      : t("none");

  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            {t("add")}
          </Button>
        }
      />

      {equipment.length === 0 ? (
        <Empty variant="surface">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Box />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
            />
          </InputGroup>
          <TableSurface>
            <Reorderable {...reordering}>
              <ul aria-label={t("title")} className="divide-y divide-border-subtle lg:hidden">
                {orderedRows.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">{t("noResults")}</li>
                ) : orderedRows.map((row) => (
                  <ReorderableItem id={row.equipment.id} key={row.equipment.id}>
                    <li className="flex min-w-0 items-center gap-1 px-2 py-2">
                      <ReorderableHandle title={tReordering("temporaryOrder")} />
                      <Button
                        variant="ghost"
                        size="row"
                        className="min-w-0 flex-1 items-start"
                        aria-label={`${tCommon("edit")} ${row.equipment.name}`}
                        onClick={() => {
                          setEditing(row.equipment);
                          setDialogOpen(true);
                        }}
                      >
                        <EquipmentThumbnail imageFileId={row.equipment.imageFileId} size="md" />
                        <span className="grid min-w-0 flex-1 gap-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">{row.equipment.name}</span>
                            <Badge
                              aria-label={`${row.upcomingCount} ${t("columns.upcoming")}`}
                              variant={row.upcomingCount > 0 ? "secondary" : "outline"}
                            >
                              {row.upcomingCount}
                            </Badge>
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[row.equipment.category ?? t("none"), row.section ?? t("unassigned")]
                              .join(" · ")}
                          </span>
                          <span className="flex min-w-0 flex-wrap gap-x-3 text-xs text-muted-foreground">
                            <span>{t("columns.next")}: {fmt(row.next)}</span>
                            {row.last && <span>{t("columns.last")}: {fmt(row.last)}</span>}
                          </span>
                        </span>
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            aria-label={t("viewInSchedule")}
                          >
                            <Link href="/">
                              <CalendarDays />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("viewInSchedule")}</TooltipContent>
                      </Tooltip>
                    </li>
                  </ReorderableItem>
                ))}
              </ul>
            </Reorderable>
            <div className="hidden lg:block">
            <Table reordering={reordering}>
              <TableCaption className="sr-only">
                {t("title")}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-px"><span className="sr-only">{tReordering("column")}</span></TableHead>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("columns.category")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("columns.section")}
                  </TableHead>
                  <TableHead numeric>{t("columns.upcoming")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("columns.next")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("columns.last")}
                  </TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableEmptyRow colSpan={8}>{t("noResults")}</TableEmptyRow>
                )}
                {orderedRows.map((row) => (
                  <TableRow key={row.equipment.id} reorderId={row.equipment.id}>
                    <TableCell className="w-px">
                      <TableDragHandle title={tReordering("temporaryOrder")} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <EquipmentThumbnail imageFileId={row.equipment.imageFileId} size="md" />
                        <div className="grid min-w-0 gap-0.5">
                          <span className="truncate font-medium">
                            {row.equipment.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground sm:hidden">
                            {[
                              row.equipment.category,
                              row.section ?? t("unassigned"),
                              row.next
                                ? `${t("columns.next")}: ${fmt(row.next)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <span className="hidden truncate text-xs text-muted-foreground sm:block md:hidden">
                            {row.next
                              ? `${t("columns.next")}: ${fmt(row.next)}`
                              : t("none")}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.equipment.category ?? t("none")}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {row.section ?? (
                        <span className="text-muted-foreground">
                          {t("unassigned")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell numeric>
                      <Badge
                        variant={row.upcomingCount > 0 ? "secondary" : "outline"}
                      >
                        {row.upcomingCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {fmt(row.next)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {fmt(row.last)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              aria-label={t("viewInSchedule")}
                            >
                              <Link href="/">
                                <CalendarDays />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("viewInSchedule")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${tCommon("edit")} ${row.equipment.name}`}
                              onClick={() => {
                                setEditing(row.equipment);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {`${tCommon("edit")} ${row.equipment.name}`}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </TableSurface>
        </>
      )}
      <EquipmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        equipment={editing}
        categories={categories}
      />
    </PageBody>
  );
}
