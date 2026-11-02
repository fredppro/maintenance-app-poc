"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Spinner } from "@/components/ui/spinner";
import { ChecklistTemplateEditor } from "./checklist-template-editor";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addEquipment as dbAddEquipment,
  createSection as dbCreateSection,
  getEquipmentRelocations,
  getMaintenancePoints,
  relocateEquipment as dbRelocateEquipment,
  saveMaintenancePoint,
  updateEquipment as dbUpdateEquipment,
} from "../server/actions";
import { useSchedulerStore } from "../store/scheduler-provider";
import type { Equipment } from "../types";
import {
  EquipmentImageField,
  uploadEquipmentImage,
  type EquipmentImageValue,
} from "./equipment-image-field";

const NO_SECTION = "__none__";

type Relocation = Awaited<ReturnType<typeof getEquipmentRelocations>>[number];
type MaintenancePoint = Awaited<ReturnType<typeof getMaintenancePoints>>[number];

/** Create/edit equipment: photo, details and location (site, section, history). */
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
  const format = useFormatter();
  const sites = useSchedulerStore((s) => s.sites);
  const sections = useSchedulerStore((s) => s.sections);
  const timeZone = useSchedulerStore((s) => s.timeZone);
  const addEquipment = useSchedulerStore((s) => s.addEquipment);
  const updateEquipment = useSchedulerStore((s) => s.updateEquipment);
  const removeEquipment = useSchedulerStore((s) => s.removeEquipment);
  const addSection = useSchedulerStore((s) => s.addSection);
  const currentSiteId = sites.find((s) => s.current)?.id ?? "";

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState<EquipmentImageValue>({
    fileId: null,
    pending: null,
  });
  const [siteId, setSiteId] = useState(currentSiteId);
  const [sectionId, setSectionId] = useState(NO_SECTION);
  const [newSection, setNewSection] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [creatingSection, setCreatingSection] = useState(false);
  const [history, setHistory] = useState<Relocation[]>([]);
  const [maintenancePoints, setMaintenancePoints] = useState<MaintenancePoint[]>([]);
  const [pointId, setPointId] = useState<string | null>(null);
  const [pointName, setPointName] = useState("");
  const [pointDescription, setPointDescription] = useState("");
  const [pointChecklist, setPointChecklist] = useState<string[]>([]);
  const [pointDraftDirty, setPointDraftDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Form state is re-seeded each time the dialog opens or its subject changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(equipment?.name ?? "");
    setCategory(equipment?.category ?? "");
    setImage({ fileId: equipment?.imageFileId ?? null, pending: null });
    setSiteId(currentSiteId);
    setSectionId(equipment?.sectionId ?? NO_SECTION);
    setNewSection("");
    setCreatingSection(false);
    setHistory([]);
    setMaintenancePoints([]);
    setPointId(null);
    setPointName("");
    setPointDescription("");
    setPointChecklist([]);
    setPointDraftDirty(false);
    if (equipment) {
      getEquipmentRelocations(equipment.id)
        .then(setHistory)
        .catch(() => undefined);
      getMaintenancePoints(equipment.id)
        .then(setMaintenancePoints)
        .catch(() => toast.error(t("failedLoadMaintenanceHistory")));
    }
  }, [open, equipment, currentSiteId, t]);

  function editMaintenancePoint(point: MaintenancePoint) {
    setPointId(point.id);
    setPointName(point.name);
    setPointDescription(point.description ?? "");
    setPointChecklist(point.checklistItems.map((item) => item.title));
    setPointDraftDirty(false);
  }

  const siteSections = useMemo(
    () => sections.filter((s) => s.siteId === siteId),
    [sections, siteId],
  );
  const effectiveSectionId = siteSections.some((s) => s.id === sectionId)
    ? sectionId
    : NO_SECTION;
  const nextSectionId =
    effectiveSectionId === NO_SECTION ? null : effectiveSectionId;
  const locationChanged =
    !!equipment &&
    (siteId !== currentSiteId || nextSectionId !== equipment.sectionId);
  const siteChanged = !!equipment && siteId !== currentSiteId;

  async function handleAddSection() {
    const sectionName = newSection.trim();
    if (!sectionName || addingSection) return;
    setAddingSection(true);
    try {
      const created = await dbCreateSection(siteId, sectionName);
      addSection(created);
      setSectionId(created.id);
      setNewSection("");
      setCreatingSection(false);
    } catch {
      toast.error(t("failedAddSection"));
    } finally {
      setAddingSection(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    const hasPointDraft =
      !!pointId ||
      !!pointName.trim() ||
      !!pointDescription.trim() ||
      pointChecklist.some((item) => item.trim());
    if (
      equipment &&
      pointDraftDirty &&
      hasPointDraft &&
      !pointName.trim()
    ) {
      toast.error(t("maintenancePointNameRequired"));
      return;
    }
    setSaving(true);
    try {
      let imageFileId = image.fileId;
      if (image.pending) {
        try {
          imageFileId = await uploadEquipmentImage(image.pending);
        } catch {
          toast.error(t("failedUploadImage"));
          return;
        }
      }
      const details = {
        name: name.trim(),
        category: category.trim() || null,
        imageFileId,
      };
      if (equipment) {
        const updated = await dbUpdateEquipment(equipment.id, details);
        updateEquipment(updated);
        if (pointDraftDirty && hasPointDraft) {
          try {
            const savedPoint = await saveMaintenancePoint(equipment.id, {
              id: pointId,
              name: pointName.trim(),
              description: pointDescription,
              checklistItems: pointChecklist
                .map((item) => item.trim())
                .filter(Boolean),
            });
            setPointId(savedPoint.id);
            setPointDraftDirty(false);
            try {
              setMaintenancePoints(await getMaintenancePoints(equipment.id));
            } catch {
              toast.error(t("failedLoadMaintenanceHistory"));
            }
          } catch {
            toast.error(t("failedSaveMaintenancePoint"));
            return;
          }
        } else if (pointDraftDirty) {
          setPointDraftDirty(false);
        }
        if (locationChanged) {
          const moved = await dbRelocateEquipment(equipment.id, {
            siteId,
            sectionId: nextSectionId,
          });
          if (siteChanged) {
            removeEquipment(equipment.id);
            const siteName = sites.find((s) => s.id === siteId)?.name ?? "";
            toast.success(t("equipmentMoved", { site: siteName }));
          } else {
            updateEquipment(moved);
            toast.success(t("equipmentUpdated"));
          }
        } else {
          toast.success(t("equipmentUpdated"));
        }
      } else {
        addEquipment(
          await dbAddEquipment({ ...details, sectionId: nextSectionId }),
        );
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

  function describe(site: string | null, section: string | null) {
    if (!site) return "";
    return section ? `${site} · ${section}` : site;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border pr-14">
          <SheetTitle>
            {equipment ? t("editEquipment") : t("addEquipment")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("equipmentDialogDescription")}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
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
            <FieldSet>
              <FieldLegend variant="label">{t("location")}</FieldLegend>
              {sites.length > 1 && equipment && (
                <Field>
                  <FieldLabel htmlFor="equipment-site">{t("site")}</FieldLabel>
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger id="equipment-site" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sites.map((s) => (
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
              <Field>
                <FieldLabel htmlFor="equipment-section">
                  {t("section")}
                </FieldLabel>
                <SearchableSelect
                  id="equipment-section"
                  value={effectiveSectionId}
                  onChange={(v) => {
                    setSectionId(v);
                    setCreatingSection(false);
                  }}
                  options={[
                    { value: NO_SECTION, label: t("noSection") },
                    ...siteSections.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  placeholder={t("noSection")}
                  searchPlaceholder={t("searchSection")}
                  emptyText={t("noSectionsYet")}
                  action={{
                    label: t("createSection"),
                    onClick: () => setCreatingSection(true),
                  }}
                />
              </Field>
              {creatingSection && (
                <Field orientation="horizontal">
                  <Input
                    autoFocus
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddSection();
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setCreatingSection(false);
                        setNewSection("");
                      }
                    }}
                    placeholder={t("newSectionPlaceholder")}
                    aria-label={t("newSection")}
                    maxLength={80}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!newSection.trim() || addingSection}
                    aria-busy={addingSection}
                    onClick={() => void handleAddSection()}
                  >
                    {addingSection ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Plus data-icon="inline-start" />
                    )}
                    {t("addSection")}
                  </Button>
                </Field>
              )}
            </FieldSet>
            {equipment && history.length > 0 && (
              <FieldSet>
                <FieldLegend variant="label">{t("locationHistory")}</FieldLegend>
                <ol className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {history.slice(0, 5).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3"
                    >
                      <span className="text-foreground">
                        {entry.fromSiteName
                          ? t("historyMoved", {
                              from: describe(
                                entry.fromSiteName,
                                entry.fromSectionName,
                              ),
                              to: describe(
                                entry.toSiteName,
                                entry.toSectionName,
                              ),
                            })
                          : t("historyPlaced", {
                              to: describe(
                                entry.toSiteName,
                                entry.toSectionName,
                              ),
                            })}
                      </span>
                      <time dateTime={entry.movedAt.toISOString()}>
                        {format.dateTime(entry.movedAt, {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone,
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              </FieldSet>
            )}
            {equipment && (
              <>
                <FieldSet>
                  <FieldLegend variant="label">
                    {t("maintenancePoints")}
                  </FieldLegend>
                  {maintenancePoints.length > 0 ? (
                    <ul className="space-y-2">
                      {maintenancePoints.map((point) => (
                        <li
                          key={point.id}
                          className="flex items-start justify-between gap-3 rounded-md border p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{point.name}</p>
                            {point.description && (
                              <p className="text-sm text-muted-foreground">
                                {point.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {t("pointChecklistCount", {
                                count: point.checklistItems.length,
                              })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => editMaintenancePoint(point)}
                          >
                            {t("editMaintenancePoint")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("noMaintenancePoints")}
                    </p>
                  )}
                  <Field>
                    <FieldLabel htmlFor="maintenance-point-name">
                      {t("maintenancePointName")}
                    </FieldLabel>
                    <Input
                      id="maintenance-point-name"
                      value={pointName}
                      onChange={(event) => {
                        setPointName(event.target.value);
                        setPointDraftDirty(true);
                      }}
                      maxLength={120}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="maintenance-point-description">
                      {t("maintenancePointDescription")}
                    </FieldLabel>
                    <Textarea
                      id="maintenance-point-description"
                      value={pointDescription}
                      onChange={(event) => {
                        setPointDescription(event.target.value);
                        setPointDraftDirty(true);
                      }}
                      maxLength={1000}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("pointChecklist")}</FieldLabel>
                    <ChecklistTemplateEditor
                      value={pointChecklist}
                      onChange={(value) => {
                        setPointChecklist(value);
                        setPointDraftDirty(true);
                      }}
                      canAdd={Boolean(pointName.trim())}
                    />
                    {!pointName.trim() && (
                      <FieldDescription>
                        {t("checklistRequiresPointName")}
                      </FieldDescription>
                    )}
                  </Field>
                  <FieldDescription>
                    {t("maintenancePointSaveWithEquipment")}
                  </FieldDescription>
                </FieldSet>
              </>
            )}
          </FieldGroup>
          <SheetFooter className="px-0 pb-0">
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
                ? siteChanged
                  ? t("saveAndMove")
                  : tCommon("save")
                : t("addEquipment")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
