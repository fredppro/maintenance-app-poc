"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

const MAX_CHECKLIST_ITEMS = 100;

export function ChecklistTemplateEditor({
  value,
  onChange,
  canAdd = true,
}: {
  value: string[];
  onChange: (items: string[]) => void;
  canAdd?: boolean;
}) {
  const t = useTranslations("Grid");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusIndex = useRef<number | null>(null);

  useEffect(() => {
    if (focusIndex.current === null) return;
    inputRefs.current[focusIndex.current]?.focus();
    focusIndex.current = null;
  }, [value]);

  const addItem = (index = value.length - 1) => {
    if (value.length >= MAX_CHECKLIST_ITEMS) return;
    const nextIndex = index + 1;
    const nextItems = [...value];
    nextItems.splice(nextIndex, 0, "");
    focusIndex.current = nextIndex;
    onChange(nextItems);
  };

  const updateItem = (index: number, title: string) => {
    onChange(value.map((item, itemIndex) => (itemIndex === index ? title : item)));
  };

  const removeItem = (index: number) => {
    const nextItems = value.filter((_, itemIndex) => itemIndex !== index);
    focusIndex.current =
      nextItems.length > 0 ? Math.min(index, nextItems.length - 1) : null;
    inputRefs.current.splice(index, 1);
    onChange(nextItems);
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {value.map((item, index) => (
            <li
              key={index}
              className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-2"
            >
              <Checkbox
                checked={false}
                disabled
                aria-hidden="true"
                tabIndex={-1}
              />
              <Input
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                value={item}
                onChange={(event) => updateItem(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (canAdd && item.trim()) addItem(index);
                  }
                }}
                placeholder={t("checklistItemPlaceholder")}
                aria-label={t("checklistItemLabel", { number: index + 1 })}
                maxLength={300}
                controlSize="sm"
                variant="inline"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("removeChecklistItem", { number: index + 1 })}
                onClick={() => removeItem(index)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("checklistEditorHint")}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        disabled={!canAdd || value.length >= MAX_CHECKLIST_ITEMS}
        onClick={() => addItem()}
      >
        <Plus data-icon="inline-start" />
        {t("addChecklistItem")}
      </Button>
    </div>
  );
}
