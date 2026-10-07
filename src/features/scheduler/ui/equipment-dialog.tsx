"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addEquipment as dbAddEquipment,
  moveEquipment as dbMoveEquipment,
  updateEquipment as dbUpdateEquipment,
} from "../server/actions";
import { useSchedulerStore } from "../store/scheduler-provider";
import type { Equipment } from "../types";
import { EquipmentImageField } from "./equipment-image-field";

/** Create/edit equipment, including its photo and (when several sites exist) its site. */
export function EquipmentDialog({
  open,
  onOpenChange,
  equipment,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  categories: string[];
}) {
  const t = useTranslations("Grid");
  const tCommon = useTranslations("Common");
  const sites = useSchedulerStore((s) => s.sites);
  const addEquipment = useSchedulerStore((s) => s.addEquipment);
  const updateEquipment = useSchedulerStore((s) => s.updateEquipment);
  const removeEquipment = useSchedulerStore((s) => s.removeEquipment);
  
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [targetSiteId, setTargetSiteId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(equipment?.name ?? "");
    setCategory(equipment?.category ?? "");
    setImage(equipment?.image ?? null);
    setTargetSiteId("");
  }, [open, equipment]);

  const canMove = !!equipment && sites.length > 1;
  const moving = canMove && targetSiteId !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category: category.trim() || undefined,
        image,
      };
      if (equipment) {
        const updated = await dbUpdateEquipment(equipment.id, payload);
        updateEquipment(updated);
        if (moving) {
          await dbMoveEquipment(equipment.id, targetSiteId);
          removeEquipment(equipment.id);
          const siteName = sites.find((s) => s.id === targetSiteId)?.name ?? "";
          toast.success(t("equipmentMoved", { site: siteName }));
        } else {
          toast.success(t("equipmentUpdated"));
        }
      } else {
        addEquipment(await dbAddEquipment(payload));
        toast.success(t("equipmentAdded"));
      }
      onOpenChange(false);
    } catch {
      toast.error(
        equipment ? t("failedUpdateEquipment") : t("failedAddEquipment"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {equipment ? t("editEquipment") : t("addEquipment")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("equipmentDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>{t("equipmentImage")}</FieldLabel>
              <EquipmentImageField
                value={image}
                onChange={setImage}
                disabled={saving}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-name">
                {t("equipmentName")}
              </FieldLabel>
              <Input
                id="equipment-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("equipmentNamePlaceholder")}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-category">
                {t("category")}
              </FieldLabel>
              <Input
                id="equipment-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("categoryPlaceholder")}
                list="timeline-categories"
              />
              <datalist id="timeline-categories">
                {categories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </Field>
            {canMove && (
              <Field>
                <FieldLabel htmlFor="equipment-site">{t("site")}</FieldLabel>
                <Select value={targetSiteId} onValueChange={setTargetSiteId}>
                  <SelectTrigger id="equipment-site" className="w-full">
                    <SelectValue placeholder={t("keepSite")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {sites
                        .filter((s) => !s.current)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("moveSiteHint")}</FieldDescription>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || saving}
              aria-busy={saving}
            >
              {saving && (
                <Spinner data-icon="inline-start" aria-label={t("saving")} />
              )}
              {equipment
                ? moving
                  ? t("saveAndMove")
                  : tCommon("save")
                : t("addEquipment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
