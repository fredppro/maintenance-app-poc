"use client";

import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
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
  TableCaption,
  TableCell,
  TableDragHandle,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
  type ReorderingOptions,
} from "@/components/ui/table";
import { Reorderable, ReorderableHandle, ReorderableItem } from "@/components/ui/reorderable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { deleteWorker, getWorkers } from "../server/actions";
import type { Worker as WorkerEntity } from "../types";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { MoreVertical, Plus, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CreateUpdateWorker from "./CreateUpdateUser";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type WorkerRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  type: string;
  createdAt: string;
};

type WorkerManagementPageProps = {
  onBack?: () => void;
  onWorkersChange: (workers: WorkerEntity[]) => void;
  locale?: string;
  timeZone?: string;
};

function WorkerActions({
  label,
  editLabel,
  removeLabel,
  onEdit,
  onDelete,
}: {
  label: string;
  editLabel: string;
  removeLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          {editLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          {removeLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function WorkerManagementPage({
  onBack,
  onWorkersChange,
  locale = "en",
  timeZone,
}: WorkerManagementPageProps) {
  const t = useTranslations("Workers");
  const tCommon = useTranslations("Common");
  const createdAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timeZone ? { timeZone } : {}),
      }),
    [locale, timeZone],
  );

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerRow | undefined>(
    undefined,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteWorker, setPendingDeleteWorker] = useState<
    WorkerRow | undefined
  >(undefined);
  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    setFetchFailed(false);
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
      onWorkersChange(data);
    } catch (err) {
      console.error(err);
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, [onWorkersChange]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  const handleOpenDrawer = (worker?: WorkerRow) => {
    setSelectedWorker(worker);
    setDrawerOpen(true);
  };

  const handleRequestDelete = (worker: WorkerRow) => {
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
      toast.error(t("failedDelete"));
    }
  };

  const handleSaved = async () => {
    setDrawerOpen(false);
    setSelectedWorker(undefined);
    await fetchWorkers();
  };

  const reordering = useMemo<ReorderingOptions>(() => ({
    enabled: true,
    items: workers.map((worker) => worker.id),
    getItemLabel: (id) => workers.find((worker) => worker.id === id)?.name ?? id,
    onReorder: (ids) => {
      setWorkers((current) => {
        const byId = new Map(current.map((worker) => [worker.id, worker]));
        return ids.map((id) => {
          const worker = byId.get(id);
          if (!worker) throw new Error("Cannot reorder a worker that is no longer in the list.");
          return worker;
        });
      });
    },
  }), [workers]);

  const columns = useMemo<ColumnDef<WorkerRow>[]>(
    () => [
      {
        id: "drag",
        header: () => <span className="sr-only">{t("columnReorder")}</span>,
        cell: () => <TableDragHandle title={t("temporaryOrder")} />,
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
          <Badge variant="outline">
            {t(row.original.type.toLowerCase())}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: t("columnCreated"),
        cell: ({ row }) => (
          <time
            dateTime={new Date(row.original.createdAt).toISOString()}
            className="whitespace-nowrap text-muted-foreground"
          >
            {createdAtFormatter.format(new Date(row.original.createdAt))}
          </time>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("columnActions")}</span>,
        cell: ({ row }) => {
          return (
            <WorkerActions
              label={t("openActions", { name: row.original.name })}
              editLabel={tCommon("edit")}
              removeLabel={tCommon("remove")}
              onEdit={() => handleOpenDrawer(row.original)}
              onDelete={() => handleRequestDelete(row.original)}
            />
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [createdAtFormatter, t, tCommon],
  );

  // TanStack Table returns unmemoizable functions; React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: workers,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <Button variant="secondary" onClick={onBack}>
                {t("backToSchedule")}
              </Button>
            )}
            <Button onClick={() => handleOpenDrawer(undefined)}>
              <Plus data-icon="inline-start" />
              {t("createWorker")}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div
          role="status"
          aria-label={t("loading")}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
        >
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 5 }, (_, row) => (
            <div
              key={row}
              className="grid grid-cols-2 items-center gap-4 border-b border-border-subtle py-3 lg:grid-cols-5"
            >
              <Skeleton className="h-4 w-32 max-w-full" />
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="hidden h-4 w-24 lg:block" />
              <Skeleton className="hidden h-4 w-20 lg:block" />
              <Skeleton className="hidden h-4 w-20 lg:block" />
            </div>
          ))}
          <span className="sr-only">{t("loading")}</span>
        </div>
      ) : fetchFailed ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("failedLoad")}</span>
            <Button variant="outline" size="sm" onClick={fetchWorkers}>
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : workers.length === 0 ? (
        <Empty variant="surface">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>{t("noWorkers")}</EmptyTitle>
            <EmptyDescription>{t("noWorkersDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => handleOpenDrawer(undefined)}>
              <Plus data-icon="inline-start" />
              {t("createWorker")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <TableSurface>
          <Reorderable {...reordering}>
            <ul className="flex flex-col divide-y divide-border-subtle lg:hidden">
              {workers.map((worker) => {
                const label = t("openActions", { name: worker.name });
                return (
                  <ReorderableItem id={worker.id} key={worker.id}>
                    <li className="flex min-w-0 items-center gap-1 px-2 py-1.5">
                      <ReorderableHandle title={t("temporaryOrder")} />
                      <Button
                        variant="ghost"
                        size="row"
                        className="min-w-0 flex-1"
                        onClick={() => handleOpenDrawer(worker)}
                      >
                        <Avatar className="size-9 shrink-0">
                          <AvatarFallback>
                            {worker.name
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase())
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">
                              {worker.name}
                            </span>
                            <Badge variant="outline">
                              {t(worker.type.toLowerCase())}
                            </Badge>
                          </span>
                          <span className="truncate text-sm text-muted-foreground">
                            {worker.email}
                          </span>
                          {worker.phone && (
                            <span className="text-xs text-muted-foreground">
                              {worker.phone}
                            </span>
                          )}
                        </span>
                      </Button>
                      <WorkerActions
                        label={label}
                        editLabel={tCommon("edit")}
                        removeLabel={tCommon("remove")}
                        onEdit={() => handleOpenDrawer(worker)}
                        onDelete={() => handleRequestDelete(worker)}
                      />
                    </li>
                  </ReorderableItem>
                );
              })}
            </ul>
          </Reorderable>
          <div className="hidden overflow-x-auto lg:block">
            <Table reordering={reordering}>
              <TableCaption className="sr-only">{t("title")}</TableCaption>
              <TableHeader className="sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan} className={header.column.id === "drag" ? "w-px" : header.column.id === "actions" ? "text-right" : undefined}>
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
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    reorderId={row.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => handleOpenDrawer(row.original)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleOpenDrawer(row.original);
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cell.column.id === "actions" ? "text-right" : undefined}
                        onClick={(event) => {
                          if (cell.column.id === "actions" || cell.column.id === "drag") {
                            event.stopPropagation();
                          }
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TableSurface>
      )}

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
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              {t("delete")}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
  );
}
