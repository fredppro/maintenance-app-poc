"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export type ReorderingOptions = {
  enabled: boolean;
  items: string[];
  onReorder: (items: string[]) => void;
  getItemLabel: (id: string) => string;
};

const ReorderingContext = React.createContext<boolean | null>(null);
const ItemContext = React.createContext<(
  Pick<ReturnType<typeof useSortable>, "attributes" | "listeners" | "setActivatorNodeRef">
  & { label: string }
) | null>(null);

function Reorderable({
  children,
  enabled,
  items,
  onReorder,
  getItemLabel,
}: ReorderingOptions & { children: React.ReactNode }) {
  const t = useTranslations("Reordering");
  const id = React.useId();
  const mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("pickedUp", { name: getItemLabel(String(active.id)) }),
    onDragOver: ({ active, over }) => active.id === over?.id ? undefined : over
      ? t("moved", {
          name: getItemLabel(String(active.id)),
          position: items.indexOf(String(over.id)) + 1,
          count: items.length,
        })
      : t("outside", { name: getItemLabel(String(active.id)) }),
    onDragEnd: ({ active, over }) => over
      ? t("dropped", {
          name: getItemLabel(String(active.id)),
          position: items.indexOf(String(over.id)) + 1,
          count: items.length,
        })
      : t("cancelled", { name: getItemLabel(String(active.id)) }),
    onDragCancel: ({ active }) => t("cancelled", { name: getItemLabel(String(active.id)) }),
  };

  return (
    <ReorderingContext value={enabled}>
      <DndContext
        id={id}
        sensors={sensors}
        cancelDrop={() => !enabled || !mounted.current}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("instructions") },
        }}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const from = items.indexOf(String(active.id));
          const to = items.indexOf(String(over.id));
          if (from < 0 || to < 0) {
            throw new Error("Reordering requires active and target IDs from the current items.");
          }
          onReorder(arrayMove(items, from, to));
        }}
      >
        <SortableContext items={items} disabled={!enabled} strategy={verticalListSortingStrategy}>
          <ItemLabelsContext value={getItemLabel}>{children}</ItemLabelsContext>
        </SortableContext>
      </DndContext>
    </ReorderingContext>
  );
}

const ItemLabelsContext = React.createContext<(id: string) => string>((id) => id);

function ReorderableItem({
  id,
  ...props
}: React.ComponentProps<typeof Slot> & { id: string }) {
  const enabled = React.useContext(ReorderingContext);
  return enabled === null
    ? <Slot data-reorder-id={id} {...props} />
    : <ActiveReorderableItem id={id} {...props} />;
}

function ActiveReorderableItem({
  id,
  style,
  className,
  ...props
}: React.ComponentProps<typeof Slot> & { id: string }) {
  const t = useTranslations("Reordering");
  const enabled = React.useContext(ReorderingContext);
  const getItemLabel = React.useContext(ItemLabelsContext);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useSortable({ id, disabled: !enabled, transition: null, attributes: { roleDescription: t("sortableItem") } });

  const item = (
    <Slot
      {...props}
      data-reorder-id={id}
      data-dragging={(enabled && isDragging) || undefined}
      className={cn("relative data-[dragging=true]:z-10 data-[dragging=true]:bg-muted data-[dragging=true]:opacity-80", className)}
      style={{ ...style, transform: enabled ? CSS.Translate.toString(transform) : undefined }}
    />
  );
  return (
    <ItemContext value={enabled ? { attributes, listeners, setActivatorNodeRef, label: t("handle", { name: getItemLabel(id) }) } : null}>
      <Slot ref={setNodeRef}>{item}</Slot>
    </ItemContext>
  );
}

function ReorderableHandle({
  className,
  onClick,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "asChild" | "children" | "size" | "variant">) {
  const item = React.useContext(ItemContext);
  if (!item) return null;
  const { attributes, listeners, setActivatorNodeRef, label } = item;

  const handle = (
    <Button
      {...attributes}
      {...listeners}
      {...props}
      type="button"
      variant="ghost"
      size="icon-sm"
      data-reorder-handle=""
      aria-label={props["aria-label"] ?? label}
      className={cn("touch-none select-none cursor-grab text-muted-foreground active:cursor-grabbing", className)}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        // Active keyboard sensors listen on document; row actions must ignore descendant targets.
        if (!attributes["aria-pressed"]) event.stopPropagation();
        onKeyDown?.(event);
        if (!event.defaultPrevented) listeners?.onKeyDown?.(event);
      }}
    >
      <GripVertical />
    </Button>
  );
  return <Slot ref={setActivatorNodeRef}>{handle}</Slot>;
}

export { Reorderable, ReorderableItem, ReorderableHandle };
