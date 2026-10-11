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
import {
  ACCEPTED_IMAGE_TYPES,
  isAcceptableImage,
  resizeImage,
  uploadImage,
} from "@/features/files/client/image";
import { cn } from "@/lib/utils";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

const MAX_EDGE = 640;

export type EquipmentImageValue = {
  /** Already-stored file, served from /api/files/[id]. */
  fileId: string | null;
  /** Resized image waiting to be uploaded when the form is saved. */
  pending: Blob | null;
};

/** Uploads a pending image and returns the stored file id. */
export function uploadEquipmentImage(blob: Blob): Promise<string> {
  return uploadImage(blob, "equipment.jpg");
}

/** Click or drop an image; it is downscaled in the browser before being saved. */
export function EquipmentImageField({
  value,
  onChange,
  disabled,
}: {
  value: EquipmentImageValue;
  onChange: (value: EquipmentImageValue) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Grid");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!value.pending) {
      // Object URLs are external resources whose lifecycle follows the picked file.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value.pending);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value.pending]);
  const src =
    previewUrl ?? (value.fileId ? `/api/files/${value.fileId}` : null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!isAcceptableImage(file)) {
      setError(t("imageInvalid"));
      return;
    }
    setProcessing(true);
    try {
      onChange({
        fileId: value.fileId,
        pending: await resizeImage(file, { maxEdge: MAX_EDGE, type: "image/jpeg" }),
      });
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
      accept={ACCEPTED_IMAGE_TYPES}
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
      {src ? (
        <div className="flex items-center gap-3 rounded-lg border border-border p-2">
          {/* Data URL thumbnail; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
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
            onClick={() => onChange({ fileId: null, pending: null })}
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
