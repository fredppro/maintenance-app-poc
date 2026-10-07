"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { EQUIPMENT_IMAGE_MAX_LENGTH } from "../server/schemas";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 320;

async function toThumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= EQUIPMENT_IMAGE_MAX_LENGTH) return url;
  }
  throw new Error("too-large");
}

/** Click or drop an image; it is downscaled in the browser before being saved. */
export function EquipmentImageField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Grid");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/") || file.size > MAX_SOURCE_BYTES) {
      setError(t("imageInvalid"));
      return;
    }
    setProcessing(true);
    try {
      onChange(await toThumbnail(file));
    } catch {
      setError(t("imageInvalid"));
    } finally {
      setProcessing(false);
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="sr-only"
      tabIndex={-1}
      aria-label={t("uploadImage")}
      disabled={disabled || processing}
      onChange={(e) => {
        void handleFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border p-2">
          {/* Data URL thumbnail; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={t("equipmentImage")}
            className="size-16 shrink-0 rounded-md border border-border object-cover"
          />
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || processing}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {t("replaceImage")}
            </Button>
          </div>
          <IconButton
            label={t("removeImage")}
            variant="danger"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <Trash2 />
          </IconButton>
          {input}
        </div>
      ) : (
        <Empty
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) void handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "min-h-0 flex-none gap-3 border-dashed p-4 transition-colors md:p-4",
            dragging && "border-primary bg-primary-muted/40",
          )}
        >
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon">
              <ImagePlus />
            </EmptyMedia>
            <EmptyTitle className="text-sm">{t("noImageTitle")}</EmptyTitle>
            <EmptyDescription className="text-xs">
              {t("imageHint")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || processing}
              aria-busy={processing}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {t("uploadImage")}
            </Button>
          </EmptyContent>
          {input}
        </Empty>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
