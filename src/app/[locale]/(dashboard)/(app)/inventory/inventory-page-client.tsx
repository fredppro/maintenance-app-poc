"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Reorderable, ReorderableHandle, ReorderableItem } from "@/components/ui/reorderable";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { mergeVisibleReorder } from "@/components/ui/reorderable";
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
import { cn } from "@/lib/utils";
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
  const tCommon = useTranslations("Common");
  const tReordering = useTranslations("Reordering");
  const locale = useLocale();
  const entries = useSchedulerStore((s) => s.entries);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InventoryItems>([]);
  const [stockOrder, setStockOrder] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Suppliers>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockLoadFailed, setStockLoadFailed] = useState(false);
  const [inventoryRequest, setInventoryRequest] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [inventoryView, setInventoryView] = useState<"stock" | "planned">("stock");
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
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: getCurrencyCode(locale),
  });
  const refreshInventory = async () => {
    setItems(await getInventoryItems());
    setStockOrder([]);
  };
  const orderedItems = useMemo(() => {
    const order = new Map(stockOrder.map((id, index) => [id, index]));
    return [...items].sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [items, stockOrder]);
  const q = query.trim().toLowerCase();
  const visibleItems = useMemo(
    () =>
      orderedItems.filter(
        (item) =>
          !q ||
          item.name.toLowerCase().includes(q) ||
          item.reference?.toLowerCase().includes(q) ||
          item.vendor?.name.toLowerCase().includes(q),
      ),
    [orderedItems, q],
  );
  const visible = rows.filter(
    (row) =>
      !q ||
      row.name.toLowerCase().includes(q) ||
      row.reference?.toLowerCase().includes(q),
  );
  const stockReordering = useMemo<ReorderingOptions>(() => ({
    enabled: true,
    items: visibleItems.map((item) => item.id),
    getItemLabel: (id) => orderedItems.find((item) => item.id === id)?.name ?? id,
    onReorder: (visibleOrder) =>
      setStockOrder((current) =>
        mergeVisibleReorder(
          items.map((item) => item.id),
          current,
          visibleOrder,
        ),
      ),
  }), [items, orderedItems, visibleItems]);

  useEffect(() => {
    let active = true;
    Promise.all([getInventoryItems(), getMaintenanceSuppliers()])
      .then(([inventory, availableSuppliers]) => {
        if (!active) return;
        setItems(inventory);
        setStockOrder([]);
        setSuppliers(availableSuppliers);
      })
      .catch(() => {
        if (!active) return;
        setStockLoadFailed(true);
        toast.error(t("stockError"));
      })
      .finally(() => {
        if (active) setStockLoading(false);
      });
    return () => {
      active = false;
    };
  }, [inventoryRequest, t]);

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
      />

      <Tabs
        value={inventoryView}
        onValueChange={(value) => {
          if (value === "stock" || value === "planned") {
            setInventoryView(value);
          }
        }}
        className="flex flex-col gap-section"
      >
        <TabsList aria-label={t("viewOptions")} className="w-full sm:w-fit">
          <TabsTrigger value="stock">{t("stockTitle")}</TabsTrigger>
          <TabsTrigger value="planned">{t("plannedMaterialsTitle")}</TabsTrigger>
        </TabsList>

        <div
          data-slot="inventory-toolbar"
          className="flex min-h-control min-w-0 items-center gap-3"
        >
          <InputGroup className="min-w-0 max-w-sm flex-1">
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
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={inventoryView !== "stock"}
            aria-hidden={inventoryView !== "stock" || undefined}
            tabIndex={inventoryView === "stock" ? 0 : -1}
            className={cn(
              "shrink-0",
              inventoryView !== "stock" && "invisible",
            )}
          >
            <Plus data-icon="inline-start" />
            {t("addInventoryItem")}
          </Button>
        </div>

        <TabsContent value="stock" className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground text-balance">
          {t("stockTitle")}
        </h2>
        {stockLoading ? (
          <div
            role="status"
            aria-label={t("loadingStock")}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : stockLoadFailed ? (
          <Alert variant="destructive">
            <AlertTitle>{t("stockLoadFailureTitle")}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("stockLoadFailure")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setStockLoadFailed(false);
                  setStockLoading(true);
                  setInventoryRequest((request) => request + 1);
                }}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {items.length > 0 && (
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
                    <Badge key={item.id} variant="warning">
                      <span className="truncate">{item.name}: {t("belowReorderPoint")}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noLowStock")}</p>
              )}
              </section>
            )}
            {items.length === 0 && !q ? (
              <Empty variant="inline">
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyTitle>
                  {t("noStockItems")}
                </EmptyTitle>
              </Empty>
            ) : visibleItems.length === 0 ? (
              <Empty variant="inline">
                <EmptyTitle>{t("noResults")}</EmptyTitle>
              </Empty>
            ) : (
              <TableSurface>
                <Reorderable {...stockReordering}>
                  <ul aria-label={t("stockTitle")} className="divide-y divide-border-subtle lg:hidden">
                    {visibleItems.map((item) => (
                      <ReorderableItem id={item.id} key={item.id}>
                        <li className="flex min-w-0 items-center gap-1 px-2 py-3">
                          <ReorderableHandle title={tReordering("temporaryOrder")} />
                          <div className="grid min-w-0 flex-1 gap-3">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="grid min-w-0 gap-0.5">
                                <span className="truncate font-medium">{item.name}</span>
                                {item.reference && (
                                  <span className="truncate text-xs text-muted-foreground">{item.reference}</span>
                                )}
                              </div>
                              {Number(item.onHand) <= Number(item.reorderPoint) && (
                                <Badge variant="warning">{t("belowReorderPoint")}</Badge>
                              )}
                            </div>
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                              <div className="grid gap-0.5">
                                <dt className="text-xs text-muted-foreground">{t("columnsStock")}</dt>
                                <dd className="tabular-nums">
                                  {Number(item.onHand).toLocaleString(locale)} {tForm(`materialUnits.${item.unit}`)}
                                </dd>
                              </div>
                              <div className="grid gap-0.5">
                                <dt className="text-xs text-muted-foreground">{t("columnsReorder")}</dt>
                                <dd className="tabular-nums">{Number(item.reorderPoint).toLocaleString(locale)}</dd>
                              </div>
                              <div className="col-span-2 grid gap-0.5">
                                <dt className="text-xs text-muted-foreground">{t("columnsSupplier")}</dt>
                                <dd className="truncate">{item.vendor?.name ?? t("none")}</dd>
                              </div>
                            </dl>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-w-28 flex-1 whitespace-normal"
                                onClick={() => setStockAction({ item, kind: "receipt" })}
                              >
                                {t("receipt")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-w-28 flex-1 whitespace-normal"
                                onClick={() => setStockAction({ item, kind: "consumption" })}
                              >
                                {t("consume")}
                              </Button>
                            </div>
                          </div>
                        </li>
                      </ReorderableItem>
                    ))}
                  </ul>
                </Reorderable>
                <div className="hidden lg:block">
                  <Table reordering={stockReordering}>
                    <TableCaption className="sr-only">{t("stockTitle")}</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-px"><span className="sr-only">{tReordering("column")}</span></TableHead>
                        <TableHead>{t("columns.name")}</TableHead>
                        <TableHead numeric>{t("columnsStock")}</TableHead>
                        <TableHead numeric>{t("columnsReorder")}</TableHead>
                        <TableHead>{t("columnsSupplier")}</TableHead>
                        <TableHead className="text-right">{t("columnsActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleItems.map((item) => (
                        <TableRow key={item.id} reorderId={item.id}>
                          <TableCell className="w-px">
                            <TableDragHandle title={tReordering("temporaryOrder")} />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{item.name}</p>
                            {item.reference && (
                              <p className="text-xs text-muted-foreground">{item.reference}</p>
                            )}
                          </TableCell>
                          <TableCell numeric>
                            {Number(item.onHand).toLocaleString(locale)}{" "}
                            {tForm(`materialUnits.${item.unit}`)}
                          </TableCell>
                          <TableCell numeric>{Number(item.reorderPoint).toLocaleString(locale)}</TableCell>
                          <TableCell>{item.vendor?.name ?? t("none")}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setStockAction({ item, kind: "receipt" })}
                              >
                                {t("receipt")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setStockAction({ item, kind: "consumption" })}
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
              </TableSurface>
            )}
          </>
        )}
      </section>

        </TabsContent>

        <TabsContent value="planned" className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground text-balance">
          {t("plannedMaterialsTitle")}
        </h2>
        {rows.length === 0 && !q ? (
          <Empty variant="surface">
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
            <TableSurface>
              <ul aria-label={t("plannedMaterialsTitle")} className="divide-y divide-border-subtle lg:hidden">
                {visible.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">{t("noResults")}</li>
                ) : visible.map((row) => (
                  <li key={row.key} className="grid gap-2 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-0.5">
                        <span className="truncate font-medium">{row.name}</span>
                        {row.reference && (
                          <span className="truncate text-xs text-muted-foreground">{row.reference}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-right font-medium tabular-nums">
                        {row.quantity.toLocaleString(locale)} {tForm(`materialUnits.${row.unit}`)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t("columns.tasks")}: <span className="tabular-nums">{row.taskCount}</span></span>
                      <span>{t("columns.cost")}: {row.cost > 0 ? money.format(row.cost) : t("none")}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden lg:block">
              <Table>
                <TableCaption className="sr-only">
                  {t("plannedMaterialsTitle")}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.name")}</TableHead>
                    <TableHead>
                      {t("columns.reference")}
                    </TableHead>
                    <TableHead numeric>
                      {t("columns.quantity")}
                    </TableHead>
                    <TableHead numeric>
                      {t("columns.tasks")}
                    </TableHead>
                    <TableHead numeric>
                      {t("columns.cost")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 && (
                    <TableEmptyRow colSpan={5}>{t("noResults")}</TableEmptyRow>
                  )}
                  {visible.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        {row.reference ?? t("none")}
                      </TableCell>
                      <TableCell numeric>
                        {row.quantity.toLocaleString(locale)}{" "}
                        <span className="text-muted-foreground">
                          {tForm(`materialUnits.${row.unit}`)}
                        </span>
                      </TableCell>
                      <TableCell numeric>
                        {row.taskCount}
                      </TableCell>
                      <TableCell numeric>
                        {row.cost > 0 ? money.format(row.cost) : t("none")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </TableSurface>
          </>
        )}
      </section>
        </TabsContent>
      </Tabs>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" closeLabel={tCommon("close")} className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("addInventoryItem")}</SheetTitle>
            <SheetDescription>{t("dialogDescription")}</SheetDescription>
          </SheetHeader>
          <Separator />
          <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
            <SheetBody>
              <FieldGroup>
                <FieldSet className="gap-3">
                  <FieldLegend
                    variant="label"
                    className="mb-0 font-semibold text-foreground"
                  >
                    {t("itemDetails")}
                  </FieldLegend>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field>
                        <FieldLabel htmlFor="inventory-name">
                          {t("name")}
                        </FieldLabel>
                        <Input
                          id="inventory-name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          required
                          maxLength={160}
                        />
                      </Field>
                    </div>
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
                      <FieldLabel htmlFor="inventory-unit">
                        {t("unitInput")}
                      </FieldLabel>
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
                  </FieldGroup>
                </FieldSet>
                <FieldSet className="gap-3">
                  <FieldLegend
                    variant="label"
                    className="mb-0 font-semibold text-foreground"
                  >
                    {t("stockSettings")}
                  </FieldLegend>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
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
                    <div className="sm:col-span-2">
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
                              <SelectItem value="__none__">
                                {t("noSupplier")}
                              </SelectItem>
                              {suppliers.map((supplier) => (
                                <SelectItem key={supplier.id} value={supplier.id}>
                                  {supplier.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </SheetBody>
            <Separator />
            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setCreateOpen(false)}
              >
                {tForm("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || saving}
                aria-busy={saving}
              >
                {saving && <Spinner data-icon="inline-start" />}
                {saving ? tForm("saving") : t("saveItem")}
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
        <SheetContent side="right" closeLabel={tCommon("close")} className="sm:max-w-md">
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
          <Separator />
          <form
            onSubmit={handleStockMovement}
            className="flex min-h-0 flex-1 flex-col"
          >
            <SheetBody>
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
            </SheetBody>
            <Separator />
            <SheetFooter>
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
                aria-busy={saving}
                disabled={
                  !movementQuantity ||
                  !Number.isFinite(Number(movementQuantity)) ||
                  (stockAction?.kind === "consumption" && !taskId) ||
                  saving
                }
              >
                {saving && <Spinner data-icon="inline-start" />}
                {saving
                  ? tForm("saving")
                  : stockAction?.kind === "receipt"
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
