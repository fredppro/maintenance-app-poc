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
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
  TableEmptyRow,
} from "@/components/ui/table";
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
            <Table>
              <TableCaption className="sr-only">
                {t("title")}
              </TableCaption>
              <TableHeader>
                <TableRow>
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
                  <TableEmptyRow colSpan={7}>{t("noResults")}</TableEmptyRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.equipment.id}>
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
