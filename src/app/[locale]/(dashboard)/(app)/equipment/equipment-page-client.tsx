"use client";

import { format } from "date-fns";
import { Box, CalendarDays, Pencil, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarizeEquipmentMaintenance } from "@/features/scheduler/utils/insights";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import type { Equipment } from "@/features/scheduler/types";
import { EquipmentThumbnail } from "@/features/scheduler/ui/equipment-thumbnail";
import { EquipmentDialog } from "@/features/scheduler/ui/equipment-dialog";
import { Link } from "@/i18n/routing";

export function EquipmentPageClient() {
  const t = useTranslations("EquipmentPage");
  const tCommon = useTranslations("Common");
  const equipment = useSchedulerStore((s) => s.equipment);
  const entries = useSchedulerStore((s) => s.entries);
  const sections = useSchedulerStore((s) => s.sections);
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
    d ? format(new Date(d), "dd/MM/yyyy") : t("none");

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
        <Empty className="border">
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
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("columns.category")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("columns.section")}
                  </TableHead>
                  <TableHead>{t("columns.upcoming")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("columns.next")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("columns.last")}
                  </TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("noResults")}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.equipment.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <EquipmentThumbnail imageFileId={row.equipment.imageFileId} size="md" />
                        <span className="truncate font-medium">
                          {row.equipment.name}
                        </span>
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
                    <TableCell>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
