"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Equipment } from "../types";
import { EquipmentThumbnail } from "./equipment-thumbnail";

interface EquipmentRowLabelProps {
  equipment: Equipment;
  className?: string;
  locationLabel: string;
  pendingCount: number;
  onEdit: () => void;
  onRemove: () => void;
}

export function EquipmentRowLabel({
  equipment,
  className,
  locationLabel,
  pendingCount,
  onEdit,
  onRemove,
}: EquipmentRowLabelProps) {
  const t = useTranslations("Grid");
  const tCommon = useTranslations("Common");

  return (
    <div
      className={cn(
        className,
        "group/equipment-label sticky left-0 z-10 flex items-center justify-between border-r border-border bg-card px-2 py-1.5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative">
          <EquipmentThumbnail imageFileId={equipment.imageFileId} size="sm" />
          <div
            className={cn(
              "absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-card",
              pendingCount > 0 ? "bg-warning" : "bg-success",
            )}
            title={
              pendingCount > 0
                ? t("equipmentInMaintenance")
                : t("equipmentActive")
            }
          />
        </div>
        <div className="min-w-0">
          <div className="max-w-[9rem] truncate text-sm font-medium text-foreground">
            {equipment.name}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {locationLabel && (
              <span className="max-w-[7rem] truncate" title={locationLabel}>
                {locationLabel}
              </span>
            )}
            {locationLabel && pendingCount > 0 && <span>•</span>}
            {pendingCount > 0 && (
              <span className="font-medium text-primary">
                {pendingCount} {pendingCount !== 1 ? t("tasks") : t("task")}
              </span>
            )}
          </div>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 transition-opacity group-hover/equipment-label:opacity-100 group-focus-within/equipment-label:opacity-100"
            aria-label={t("equipmentActions", { equipment: equipment.name })}
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="gap-2" onClick={onEdit}>
            <Pencil />
            {tCommon("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={onRemove}
          >
            <Trash2 />
            {tCommon("remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
