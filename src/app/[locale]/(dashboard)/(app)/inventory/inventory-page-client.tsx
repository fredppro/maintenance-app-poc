"use client";

import { Package, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
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
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import { getCurrencyCode } from "@/features/scheduler/utils/currency";

interface Row {
  key: string;
  name: string;
  reference?: string;
  unit: string;
  quantity: number;
  cost: number;
  taskIds: Set<string>;
}

export function InventoryPageClient() {
  const t = useTranslations("InventoryPage");
  const tForm = useTranslations("Form");
  const locale = useLocale();
  const entries = useSchedulerStore((s) => s.entries);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const entry of entries) {
      for (const m of entry.materials ?? []) {
        const key = `${m.name.toLowerCase()}|${m.reference ?? ""}|${m.unit}`;
        const row = map.get(key) ?? {
          key,
          name: m.name,
          reference: m.reference ?? undefined,
          unit: m.unit,
          quantity: 0,
          cost: 0,
          taskIds: new Set<string>(),
        };
        row.quantity += Number(m.quantity);
        row.cost += Number(m.quantity) * Number(m.price ?? 0);
        row.taskIds.add(entry.id);
        map.set(key, row);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.reference?.toLowerCase().includes(q),
  );
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: getCurrencyCode(locale),
  });

  return (
    <PageBody>
      <PageHeader title={t("title")} description={t("description")} />
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
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
                  <TableHead className="hidden sm:table-cell">
                    {t("columns.reference")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("columns.quantity")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("columns.tasks")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell text-right">
                    {t("columns.cost")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("noResults")}
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r.reference ?? t("none")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.quantity.toLocaleString(locale)}{" "}
                      <span className="text-muted-foreground">
                        {tForm(`materialUnits.${r.unit}`)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.taskIds.size}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {r.cost > 0 ? money.format(r.cost) : t("none")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </PageBody>
  );
}
