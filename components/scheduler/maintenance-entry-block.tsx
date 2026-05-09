"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TimePicker } from "@/components/ui/time-picker";
import { useSchedulerStore } from "@/lib/scheduler-store";
import { MaintenanceEntry } from "@/lib/scheduler-types";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMinutes, format, set } from "date-fns";
import { CalendarIcon, GripVertical, Plus, Trash2, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { TaskType } from "../../generated/prisma/enums";

const materialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  reference: z.string().optional(),
  quantity: z
    .number()
    .min(0.1, "Quantity must be > 0")
    .multipleOf(0.1, "Only one decimal place allowed"),
});

const editFormSchema = z.object({
  status: z.string(),
  type: z.nativeEnum(TaskType),
  startTime: z.date(),
  endTime: z.date(),
  workerIds: z.array(z.string()).min(1, "Select at least one worker"),
  materials: z.array(materialSchema).optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

interface MaintenanceEntryBlockProps {
  entry: MaintenanceEntry;
  style?: React.CSSProperties;
  onDragStart: () => void;
  isDragging?: boolean;
  timeSlotsCount: number;
}

export function MaintenanceEntryBlock({
  entry,
  style,
  onDragStart,
  isDragging,
  timeSlotsCount,
}: MaintenanceEntryBlockProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { equipment, workers, removeEntry, updateEntry, viewMode } =
    useSchedulerStore();

  const equip = equipment.find((e) => e.id === entry.equipmentId);
  const assignedWorkers = entry.assignments?.map((a) => a.worker) || [];

  // Resize state
  const [isResizing, setIsResizing] = useState<"start" | "end" | null>(null);
  const [resizeOffset, setResizeOffset] = useState(0);
  const entryRef = useRef<HTMLDivElement>(null);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      status: entry.status,
      type: entry.type,
      startTime: new Date(entry.startTime),
      endTime: new Date(entry.endTime),
      workerIds: entry.assignments?.map((a) => a.workerId) || [],
      materials:
        entry.materials?.map((m) => ({
          name: m.name,
          reference: m.reference || "",
          quantity: m.quantity,
        })) || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "materials",
  });

  useEffect(() => {
    if (detailsOpen && !form.formState.isSubmitting) {
      form.reset({
        status: entry.status,
        type: entry.type,
        startTime: new Date(entry.startTime),
        endTime: new Date(entry.endTime),
        workerIds: entry.assignments?.map((a) => a.workerId) || [],
        materials:
          entry.materials?.map((m) => ({
            name: m.name,
            reference: m.reference || "",
            quantity: m.quantity,
          })) || [],
      });
    }
  }, [detailsOpen, entry, form, form.formState.isSubmitting]);

  const getStatusBadge = () => {
    switch (entry.status) {
      case "scheduled":
        return (
          <Badge variant="secondary" className="text-xs">
            Scheduled
          </Badge>
        );
      case "in-progress":
        return (
          <Badge className="bg-chart-3/20 text-chart-3 border-chart-3/40 text-xs">
            In Progress
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/40 text-xs">
            Completed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {entry.status}
          </Badge>
        );
    }
  };

  const getTypeStyles = () => {
    switch (entry.type) {
      case TaskType.PREVENTIVE:
        return "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400";
      case TaskType.INSPECTION:
        return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400";
      case TaskType.CORRECTIVE:
        return "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400";
      default:
        return "bg-primary/10 border-primary/20 text-primary";
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (isResizing) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    onDragStart();
  };

  const handleClick = (e: React.MouseEvent) => {
    // If we were resizing, don't open the dialog
    if (isResizing) return;

    e.stopPropagation();
    setDetailsOpen(true);
  };

  const handleDelete = async () => {
    try {
      await removeEntry(entry.id);
      setDetailsOpen(false);
      toast.success("Entry deleted");
    } catch (error) {
      toast.error("Failed to delete entry");
    }
  };

  const onSave = async (values: EditFormValues) => {
    if (values.endTime <= values.startTime) {
      toast.error("End time must be after start time");
      return;
    }

    try {
      // TODO: find a better solution instead of using any
      await updateEntry(entry.id, values as any);
      toast.success("Task updated successfully");
      setDetailsOpen(false);
    } catch (error) {
      toast.error("Failed to update task");
    }
  };

  // --- Resizing Logic ---

  const handleResizeStart = (type: "start" | "end", e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(type);
    setResizeOffset(0);

    const startX = e.clientX;
    const containerWidth =
      entryRef.current?.parentElement?.getBoundingClientRect().width || 1000;
    const pixelsPerSlot = containerWidth / timeSlotsCount;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setResizeOffset(deltaX);
    };

    const onMouseUp = async (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      const finalDeltaX = upEvent.clientX - startX;
      // Keep isResizing state briefly to prevent handleClick from opening dialog
      setTimeout(() => setIsResizing(null), 100);
      setResizeOffset(0);

      if (Math.abs(finalDeltaX) < 5) return;

      // Calculate time change based on viewMode
      let pixelsPerMinute = 0;
      if (viewMode === "day") pixelsPerMinute = pixelsPerSlot / 60;
      else if (viewMode === "week") pixelsPerMinute = pixelsPerSlot / (24 * 60);
      else if (viewMode === "month")
        pixelsPerMinute = pixelsPerSlot / (24 * 60);
      else if (viewMode === "year")
        pixelsPerMinute = pixelsPerSlot / (30 * 24 * 60);

      const minutesChange = finalDeltaX / pixelsPerMinute;

      // Snapping
      let snappedMinutes = minutesChange;
      if (viewMode === "day") {
        snappedMinutes = Math.round(minutesChange / 15) * 15;
      } else {
        snappedMinutes = Math.round(minutesChange / (24 * 60)) * (24 * 60);
      }

      if (snappedMinutes === 0) return;

      const newStartTime = new Date(entry.startTime);
      const newEndTime = new Date(entry.endTime);

      if (type === "start") {
        const potentialStart = addMinutes(newStartTime, snappedMinutes);
        if (potentialStart < newEndTime) {
          await updateEntry(entry.id, { startTime: potentialStart });
        }
      } else {
        const potentialEnd = addMinutes(newEndTime, snappedMinutes);
        if (potentialEnd > newStartTime) {
          await updateEntry(entry.id, { endTime: potentialEnd });
        }
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const workerOptions = workers.map((w) => ({
    label: `${w.name} (${w.email})`,
    value: w.id,
  }));

  const visualStyle = {
    ...style,
    ...(isResizing === "start"
      ? {
          left: `calc(${style?.left || "0px"} + ${resizeOffset}px)`,
          width: `calc(${style?.width || "0px"} - ${resizeOffset}px)`,
        }
      : {}),
    ...(isResizing === "end"
      ? {
          width: `calc(${style?.width || "0px"} + ${resizeOffset}px)`,
        }
      : {}),
  };

  return (
    <>
      <div
        ref={entryRef}
        draggable={!isResizing}
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={visualStyle}
        className={cn(
          "rounded-md border px-2 py-1 cursor-grab active:cursor-grabbing group select-none",
          "flex items-center gap-1 overflow-hidden transition-[background-color,border-color,ring]",
          "hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background",
          getTypeStyles(),
          isDragging && "opacity-50 scale-95",
          isResizing &&
            "cursor-col-resize ring-2 ring-primary border-primary/50 z-50",
        )}
      >
        {/* Left Resize Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => handleResizeStart("start", e)}
        />

        <GripVertical className="w-3 h-3 flex-shrink-0 opacity-50" />
        <Wrench className="w-3 h-3 flex-shrink-0" />
        <span className="text-xs font-medium truncate flex-1">
          {entry.title}
        </span>

        {/* Initials stack */}
        <div className="flex -space-x-2 overflow-hidden">
          {assignedWorkers.slice(0, 2).map((worker) => (
            <div
              key={worker.id}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-primary text-[8px] font-bold text-primary-foreground"
              title={worker.name}
            >
              {getInitials(worker.name)}
            </div>
          ))}
          {assignedWorkers.length > 2 && (
            <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted text-[8px] font-bold text-muted-foreground">
              +{assignedWorkers.length - 2}
            </div>
          )}
        </div>

        {/* Right Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => handleResizeStart("end", e)}
        />
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-xl lg:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Edit: {entry.title}
            </DialogTitle>
            <DialogDescription className="flex items-center justify-between">
              {equip?.name} {equip?.category ? `- ${equip.category}` : ""}
              <span className="text-sm text-muted-foreground font-medium">
                {getStatusBadge()}
              </span>
            </DialogDescription>
          </DialogHeader>

          <form
            id="maintenance-form"
            onSubmit={form.handleSubmit(onSave)}
            className="space-y-4 py-4 -mx-4 max-h-[50vh] overflow-y-auto px-4"
          >
            {/* Status moved to top and integrated into form state */}
            <div className="space-y-2 pb-2 border-b">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Status
              </Label>
              <div className="flex gap-2">
                {["scheduled", "in-progress", "completed"].map((status) => {
                  const isActive = form.watch("status") === status;
                  return (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      className={cn(
                        "flex-1 capitalize text-xs h-8 transition-all",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-background text-muted-foreground hover:bg-muted",
                      )}
                      variant={isActive ? "default" : "outline"}
                      onClick={() =>
                        form.setValue("status", status, { shouldDirty: true })
                      }
                    >
                      {status.replace("-", " ")}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  Start Date & Time
                </Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 justify-start text-left font-normal text-xs h-9"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {format(form.watch("startTime"), "PP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={form.watch("startTime")}
                        onSelect={(date) =>
                          date &&
                          form.setValue(
                            "startTime",
                            set(form.getValues("startTime"), {
                              year: date.getFullYear(),
                              month: date.getMonth(),
                              date: date.getDate(),
                            }),
                          )
                        }
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker
                    date={form.watch("startTime")}
                    onChange={(d) => form.setValue("startTime", d)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">End Date & Time</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 justify-start text-left font-normal text-xs h-9"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {format(form.watch("endTime"), "PP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={form.watch("endTime")}
                        onSelect={(date) =>
                          date &&
                          form.setValue(
                            "endTime",
                            set(form.getValues("endTime"), {
                              year: date.getFullYear(),
                              month: date.getMonth(),
                              date: date.getDate(),
                            }),
                          )
                        }
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker
                    date={form.watch("endTime")}
                    onChange={(d) => form.setValue("endTime", d)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Task Type</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as TaskType)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TaskType.PREVENTIVE}>
                    Preventive
                  </SelectItem>
                  <SelectItem value={TaskType.INSPECTION}>
                    Inspection
                  </SelectItem>
                  <SelectItem value={TaskType.CORRECTIVE}>
                    Corrective
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Assigned Workers</Label>
              <MultiSelect
                options={workerOptions}
                selected={form.watch("workerIds")}
                onChange={(v) => form.setValue("workerIds", v)}
                placeholder="Select workers..."
              />
            </div>

            <div className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold">Materials Used</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() =>
                    append({ name: "", reference: "", quantity: 1 })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add Material
                </Button>
              </div>

              {fields.length > 0 ? (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[45%]">Item Name</TableHead>
                        <TableHead className="w-[25%]">Reference</TableHead>
                        <TableHead className="w-[20%] text-right">
                          Qty
                        </TableHead>
                        <TableHead className="w-[10%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow key={field.id} className="group">
                          <TableCell className="p-2">
                            <Input
                              {...form.register(
                                `materials.${index}.name` as const,
                              )}
                              placeholder="Item name"
                              className="h-8 text-xs"
                            />
                            {form.formState.errors.materials?.[index]?.name && (
                              <p className="text-[10px] text-destructive mt-1">
                                {
                                  form.formState.errors.materials[index]?.name
                                    ?.message
                                }
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-2">
                            <Input
                              {...form.register(
                                `materials.${index}.reference` as const,
                              )}
                              placeholder="Ref #"
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell className="p-2 text-right">
                            <Input
                              type="number"
                              step="0.1"
                              {...form.register(
                                `materials.${index}.quantity` as const,
                                { valueAsNumber: true },
                              )}
                              className="h-8 text-xs text-right"
                            />
                            {form.formState.errors.materials?.[index]
                              ?.quantity && (
                              <p className="text-[10px] text-destructive mt-1">
                                {
                                  form.formState.errors.materials[index]
                                    ?.quantity?.message
                                }
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center p-6 border border-dashed rounded-md bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    No materials added yet.
                  </p>
                </div>
              )}
            </div>

            {/* <pre className="text-[10px]">
              {JSON.stringify(form.formState, null, 2)}
            </pre> */}
          </form>

          <DialogFooter className="flex flex-row justify-between gap-2 sm:gap-0 mt-2 border-t pt-2">
            <Field orientation="horizontal" className="justify-end">
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete Entry
              </Button>
              <Button
                type="submit"
                form="maintenance-form"
                size="sm"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving...
                  </span>
                ) : (
                  "Save All Changes"
                )}
              </Button>
            </Field>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
