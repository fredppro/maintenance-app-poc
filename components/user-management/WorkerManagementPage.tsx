"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteWorker, getWorkers } from "@/lib/actions";
import { useSchedulerStore } from "@/lib/scheduler-store";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ColumnDef,
  Row,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { GripVertical, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import CreateUpdateWorker from "./CreateUpdateUser";

type Worker = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  type: string;
  createdAt: string;
};

type WorkerManagementPageProps = {
  onBack: () => void;
};

function DragHandle({
  attributes,
  listeners,
}: {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
}) {
  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
    >
      <GripVertical className="size-4" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  );
}

function DraggableRow({
  row,
  onOpenDrawer,
}: {
  row: Row<Worker>;
  onOpenDrawer: (worker: Worker) => void;
}) {
  const {
    transform,
    transition,
    setNodeRef,
    attributes,
    listeners,
    isDragging,
  } = useSortable({ id: row.id });

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      onClick={() => onOpenDrawer(row.original)}
      className="relative z-0 cursor-pointer data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 hover:bg-muted"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          onClick={(event) => {
            if (
              cell.column.id === "select" ||
              cell.column.id === "actions" ||
              cell.column.id === "drag"
            ) {
              event.stopPropagation();
            }
          }}
        >
          {cell.column.id === "drag" ? (
            <DragHandle attributes={attributes} listeners={listeners} />
          ) : (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}

export default function WorkerManagementPage({
  onBack,
}: WorkerManagementPageProps) {
  const t = useTranslations("Workers");
  const tCommon = useTranslations("Common");

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | undefined>(
    undefined,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteWorker, setPendingDeleteWorker] = useState<
    Worker | undefined
  >(undefined);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >({});
  const setWorkersStore = useSchedulerStore((state) => state.setWorkers);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const data = await getWorkers();
      const normalized = (data || []).map((worker) => ({
        ...worker,
        createdAt:
          worker.createdAt instanceof Date
            ? worker.createdAt.toISOString()
            : worker.createdAt,
      }));
      setWorkers(normalized);
      setWorkersStore(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  const handleOpenDrawer = (worker?: Worker) => {
    setSelectedWorker(worker);
    setDrawerOpen(true);
  };

  const handleRequestDelete = (worker: Worker) => {
    setPendingDeleteWorker(worker);
    setConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!pendingDeleteWorker) return;
    try {
      await deleteWorker(pendingDeleteWorker.id);
      setConfirmOpen(false);
      setPendingDeleteWorker(undefined);
      await fetchWorkers();
    } catch (err) {
      console.error(err);
      alert(t("failedDelete"));
    }
  };

  const handleSaved = async () => {
    setDrawerOpen(false);
    setSelectedWorker(undefined);
    await fetchWorkers();
  };

  const columns = useMemo<ColumnDef<Worker>[]>(
    () => [
      {
        id: "drag",
        header: () => null,
        cell: () => null,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              className="
                border-border bg-secondary
                data-[state=checked]:border-secondary
                "
              checked={
                table.getIsAllRowsSelected() ||
                (table.getIsSomeRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
              aria-label={t("selectAll")}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              className="
                border-border bg-secondary
                data-[state=checked]:border-secondary
                "
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label={t("selectRow")}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: t("columnName"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="size-6">
              <AvatarFallback>
                {row.original.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 truncate">{row.original.name}</div>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: t("columnEmail"),
        cell: ({ row }) => (
          <div className="min-w-[12rem] truncate">{row.original.email}</div>
        ),
      },
      {
        accessorKey: "phone",
        header: t("columnPhone"),
        cell: ({ row }) => row.original.phone ?? "—",
      },
      {
        accessorKey: "type",
        header: t("columnType"),
        cell: ({ row }) => (
          <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
            {t(row.original.type.toLowerCase())}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: t("columnCreated"),
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
                size="icon"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenDrawer(row.original);
                }}
              >
                {tCommon("edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRequestDelete(row.original);
                }}
              >
                {tCommon("remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: workers,
    columns,
    state: {
      rowSelection,
      columnVisibility,
    },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  });

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor),
  );

  const dataIds = useMemo<UniqueIdentifier[]>(
    () => workers.map((worker) => worker.id),
    [workers],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active?.id && over?.id && active.id !== over.id) {
      setWorkers((currentWorkers) => {
        const oldIndex = currentWorkers.findIndex(
          (item) => item.id === active.id,
        );
        const newIndex = currentWorkers.findIndex(
          (item) => item.id === over.id,
        );
        return arrayMove(currentWorkers, oldIndex, newIndex);
      });
    }
  };

  return (
    <div className="flex min-h-full w-full flex-col gap-4 overflow-hidden rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="default" onClick={onBack}>
            {t("backToSchedule")}
          </Button>
          <Button size="default" onClick={() => handleOpenDrawer(undefined)}>
            {t("createWorker")}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border border-border bg-background">
        {loading ? (
          <div className="p-4">{t("loading")}</div>
        ) : workers.length === 0 ? (
          <div className="p-4 text-muted-foreground">{t("noWorkers")}</div>
        ) : (
          <div className="h-full min-w-full overflow-auto">
            <div className="w-full overflow-x-auto">
              <DndContext
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
                sensors={sensors}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id} colSpan={header.colSpan}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length ? (
                      <SortableContext
                        items={dataIds}
                        strategy={verticalListSortingStrategy}
                      >
                        {table.getRowModel().rows.map((row) => (
                          <DraggableRow
                            key={row.id}
                            row={row}
                            onOpenDrawer={handleOpenDrawer}
                          />
                        ))}
                      </SortableContext>
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          className="h-24 text-center"
                        >
                          {t("noResults")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
            </div>
          </div>
        )}
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="right">
        <DrawerContent className="w-full sm:max-w-md">
          <DrawerHeader>
            <DrawerTitle>
              {selectedWorker ? t("editWorker") : t("createWorker")}
            </DrawerTitle>
            <DrawerDescription>{t("drawerDescription")}</DrawerDescription>
          </DrawerHeader>

          <div className="h-full overflow-y-auto px-4 pb-4">
            <CreateUpdateWorker
              initialData={selectedWorker}
              onCancel={() => setDrawerOpen(false)}
              onSaved={handleSaved}
            />
          </div>

          <DrawerFooter>
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit" form="worker-form">
                {selectedWorker ? tCommon("save") : t("createWorker")}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteWorker")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmation", {
                name: pendingDeleteWorker?.name ?? t("thisWorker"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("delete")}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
