"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_IMAGE_TYPES,
  isAcceptableImage,
  resizeImage,
} from "@/features/files/client/image";

const LOGO_MAX_EDGE = 512;

export type OrganizationLogoValue = {
  /** Already-stored file, served from /api/files/[id]. */
  fileId: string | null;
  /** Resized image waiting to be uploaded when the settings are saved. */
  pending: Blob | null;
};

/** Pick a logo; it is resized in the browser and only uploaded when the form is saved. */
export function OrganizationLogoField({
  id,
  name,
  value,
  onChange,
  disabled,
}: {
  id: string;
  name: string;
  value: OrganizationLogoValue;
  onChange: (value: OrganizationLogoValue) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("OrganizationSettings");
  const inputRef = useRef<HTMLInputElement>(null);
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

  const src = previewUrl ?? (value.fileId ? `/api/files/${value.fileId}` : null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!isAcceptableImage(file)) {
      setError(t("logoInvalid"));
      return;
    }
    setProcessing(true);
    try {
      // Keep transparency for PNG/WebP sources; JPEG stays JPEG.
      const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
      onChange({ fileId: value.fileId, pending: await resizeImage(file, { maxEdge: LOGO_MAX_EDGE, type }) });
    } catch {
      setError(t("logoInvalid"));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
          data-testid="organization-logo-preview"
        >
          {src ? (
            // The logo is a same-origin, authenticated file; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={t("logoAlt", { name })} className="size-full object-contain" />
          ) : (
            <Building2 aria-label={t("logoNone")} className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || processing}
            aria-busy={processing}
            onClick={() => inputRef.current?.click()}
          >
            <Upload data-icon="inline-start" />
            {src ? t("logoReplace") : t("logoUpload")}
          </Button>
          {src && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || processing}
              onClick={() => {
                setError(null);
                onChange({ fileId: null, pending: null });
              }}
            >
              <Trash2 data-icon="inline-start" />
              {t("logoRemove")}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("logoUpload")}
          disabled={disabled || processing}
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
