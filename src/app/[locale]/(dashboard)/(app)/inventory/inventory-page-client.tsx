"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import {
  consumeInventory,
  createInventoryItem,
  getInventoryItems,
  getMaintenanceSuppliers,
  receiveInventory,
} from "@/features/scheduler/server/actions";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import { summarizeMaterials } from "@/features/scheduler/utils/insights";
import { getCurrencyCode } from "@/features/scheduler/utils/currency";
import { MaterialUnit } from "../../../../../../prisma/generated/prisma/enums";
import { Package, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type InventoryItems = Awaited<ReturnType<typeof getInventoryItems>>;
type Suppliers = Awaited<ReturnType<typeof getMaintenanceSuppliers>>;
type StockAction = {
  item: InventoryItems[number];
  kind: "receipt" | "consumption";
};

export function InventoryPageClient() {
  const t = useTranslations("InventoryPage");
  const tForm = useTranslations("Form");
  const locale = useLocale();
  const entries = useSchedulerStore((s) => s.entries);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InventoryItems>([]);
  const [suppliers, setSuppliers] = useState<Suppliers>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [stockAction, setStockAction] = useState<StockAction | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [unit, setUnit] = useState<MaterialUnit>(MaterialUnit.PC);
  const [openingStock, setOpeningStock] = useState("0");
  const [reorderPoint, setReorderPoint] = useState("0");
  const [supplierId, setSupplierId] = useState("__none__");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [taskId, setTaskId] = useState("");

  const rows = useMemo(() => summarizeMaterials(entries), [entries]);
  const lowStock = useMemo(
    () =>
      items.filter(
        (item) => Number(item.onHand) <= Number(item.reorderPoint),
      ),
    [items],
  );
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      !q ||
      row.name.toLowerCase().includes(q) ||
      row.reference?.toLowerCase().includes(q),
  );
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: getCurrencyCode(locale),
  });
  const refreshInventory = async () => setItems(await getInventoryItems());

  useEffect(() => {
    let active = true;
    Promise.all([getInventoryItems(), getMaintenanceSuppliers()])
      .then(([inventory, availableSuppliers]) => {
        if (!active) return;
        setItems(inventory);
        setSuppliers(availableSuppliers);
      })
      .catch(() => {
        if (active) toast.error(t("stockError"));
      });
    return () => {
      active = false;
    };
  }, [t]);

  function resetCreateForm() {
    setName("");
    setReference("");
    setUnit(MaterialUnit.PC);
    setOpeningStock("0");
    setReorderPoint("0");
    setSupplierId("__none__");
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await createInventoryItem({
        name,
        reference: reference || null,
        unit,
        openingStock: Number(openingStock),
        reorderPoint: Number(reorderPoint),
        vendorId: supplierId === "__none__" ? null : supplierId,
      });
      await refreshInventory();
      resetCreateForm();
      setCreateOpen(false);
      toast.success(t("itemSaved"));
    } catch {
      toast.error(t("itemError"));
    } finally {
      setSaving(false);
    }
  }

  function closeStockAction() {
    setStockAction(null);
    setMovementQuantity("");
    setMovementNote("");
    setTaskId("");
  }

  async function handleStockMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockAction || saving) return;
    setSaving(true);
    try {
      const input = {
        quantity: Number(movementQuantity),
        note: movementNote || null,
      };
      if (stockAction.kind === "receipt") {
        await receiveInventory(stockAction.item.id, input);
      } else {
        await consumeInventory(stockAction.item.id, taskId, input);
      }
      await refreshInventory();
      closeStockAction();
      toast.success(t("stockSaved"));
    } catch {
      toast.error(t("stockError"));
    } finally {
      setSaving(false);
    }
  }

  const activeTasks = entries.filter(
    (entry) => entry.status !== "cancelled" && entry.status !== "deleted",
  );

  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            {t("addInventoryItem")}
          </Button>
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("stockTitle")}</h2>
        <section
          aria-labelledby="purchase-reminders-heading"
          className="flex flex-col gap-2"
        >
          <h3 id="purchase-reminders-heading" className="font-medium">
            {t("lowStockTitle")}
          </h3>
          {lowStock.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {lowStock.map((item) => (
                <Badge key={item.id} variant="destructive">
                  {item.name}: {t("belowReorderPoint")}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noLowStock")}</p>
          )}
        </section>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noStockItems")}</p>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableCaption className="sr-only">
                {t("stockTitle")}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead className="text-right">{t("columnsStock")}</TableHead>
                  <TableHead className="text-right">{t("columnsReorder")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("columnsSupplier")}</TableHead>
                  <TableHead className="text-right">{t("columnsActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.name}</p>
                      {item.reference && (
                        <p className="text-xs text-muted-foreground">
                          {item.reference}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(item.onHand).toLocaleString(locale)}{" "}
                      {tForm(`materialUnits.${item.unit}`)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(item.reorderPoint).toLocaleString(locale)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {item.vendor?.name ?? t("none")}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setStockAction({ item, kind: "receipt" })
                          }
                        >
                          {t("receipt")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setStockAction({ item, kind: "consumption" })
                          }
                        >
                          {t("consume")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <PageHeader title={t("plannedMaterialsTitle")} />
        {rows.length === 0 ? (
          <div className="rounded-lg border p-6 text-center">
            <Package className="mx-auto mb-2 text-muted-foreground" />
            <h3 className="font-medium">{t("emptyTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <>
            <InputGroup className="max-w-sm">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
              />
            </InputGroup>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableCaption className="sr-only">
                  {t("plannedMaterialsTitle")}
                </TableCaption>
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
                    <TableHead className="hidden text-right sm:table-cell">
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
                  {visible.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {row.reference ?? t("none")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.quantity.toLocaleString(locale)}{" "}
                        <span className="text-muted-foreground">
                          {tForm(`materialUnits.${row.unit}`)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {row.taskCount}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {row.cost > 0 ? money.format(row.cost) : t("none")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("addInventoryItem")}</SheetTitle>
            <SheetDescription>{t("dialogDescription")}</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4 p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="inventory-name">{t("name")}</FieldLabel>
                <Input
                  id="inventory-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={160}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="inventory-reference">
                  {t("referenceInput")}
                </FieldLabel>
                <Input
                  id="inventory-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="inventory-unit">{t("unitInput")}</FieldLabel>
                <Select
                  value={unit}
                  onValueChange={(value) => setUnit(value as MaterialUnit)}
                >
                  <SelectTrigger id="inventory-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.values(MaterialUnit).map((value) => (
                        <SelectItem key={value} value={value}>
                          {tForm(`materialUnits.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="inventory-opening">
                  {t("openingStock")}
                </FieldLabel>
                <Input
                  id="inventory-opening"
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingStock}
                  onChange={(event) => setOpeningStock(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="inventory-reorder">
                  {t("reorderPoint")}
                </FieldLabel>
                <Input
                  id="inventory-reorder"
                  type="number"
                  min="0"
                  step="0.01"
                  value={reorderPoint}
                  onChange={(event) => setReorderPoint(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="inventory-supplier">
                  {t("supplier")}
                </FieldLabel>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="inventory-supplier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="__none__">{t("noSupplier")}</SelectItem>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <SheetFooter className="px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setCreateOpen(false)}
              >
                {tForm("cancel")}
              </Button>
              <Button type="submit" disabled={!name.trim() || saving}>
                {saving && <Spinner data-icon="inline-start" />}
                {t("saveItem")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={stockAction !== null}
        onOpenChange={(open) => {
          if (!open) closeStockAction();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {stockAction?.kind === "receipt" ? t("receipt") : t("consume")}
            </SheetTitle>
            <SheetDescription>
              {stockAction?.item.name} ·{" "}
              {Number(stockAction?.item.onHand ?? 0).toLocaleString(locale)}{" "}
              {tForm(`materialUnits.${stockAction?.item.unit ?? MaterialUnit.PC}`)}
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={handleStockMovement}
            className="flex flex-col gap-4 p-4"
          >
            <FieldGroup>
              {stockAction?.kind === "consumption" && (
                <Field>
                  <FieldLabel htmlFor="inventory-task">{t("task")}</FieldLabel>
                  <Select value={taskId} onValueChange={setTaskId}>
                    <SelectTrigger id="inventory-task">
                      <SelectValue placeholder={t("selectTask")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {activeTasks.map((task) => (
                          <SelectItem key={task.id} value={task.id}>
                            {task.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="inventory-quantity">
                  {t("quantityInput")}
                </FieldLabel>
                <Input
                  id="inventory-quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={movementQuantity}
                  onChange={(event) =>
                    setMovementQuantity(event.target.value)
                  }
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="inventory-note">{t("note")}</FieldLabel>
                <Input
                  id="inventory-note"
                  value={movementNote}
                  onChange={(event) => setMovementNote(event.target.value)}
                  maxLength={1000}
                />
              </Field>
            </FieldGroup>
            <SheetFooter className="px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={closeStockAction}
              >
                {tForm("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  !movementQuantity ||
                  !Number.isFinite(Number(movementQuantity)) ||
                  (stockAction?.kind === "consumption" && !taskId) ||
                  saving
                }
              >
                {saving && <Spinner data-icon="inline-start" />}
                {stockAction?.kind === "receipt"
                  ? t("recordReceipt")
                  : t("recordConsumption")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </PageBody>
  );
}
