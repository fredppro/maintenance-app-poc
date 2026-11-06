"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, ImagePlus, Trash2, Upload } from "lucide-react";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { MAX_FILE_BYTES } from "../file-policy";
import {
  ACCEPTED_IMAGE_TYPES,
  getImageFileValidationError,
  MAX_SOURCE_BYTES,
  type ImageFileValidationError,
  type ImageUploadErrorKey,
} from "../client/image";

export type ImageUploadValue = {
  fileId: string | null;
  pending: Blob | null;
  fileName?: string | null;
  fileSize?: number | null;
};

type UploadLabels = {
  choose: string;
  replace: string;
  remove: string;
  emptyTitle: string;
  emptyDescription: string;
  imageAlt: string;
  noImage: string;
};

type LocalError = ImageFileValidationError | "unreadable" | "outputTooLarge" | "singleFileOnly";

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageUploadField({
  id,
  value,
  onChange,
  onUploadErrorClear,
  prepareImage,
  labels,
  disabled,
  uploading = false,
  uploadProgress = null,
  uploadError = null,
  ariaInvalid,
  ariaDescribedBy,
}: {
  id: string;
  value: ImageUploadValue;
  onChange: (value: ImageUploadValue) => void;
  onUploadErrorClear?: () => void;
  prepareImage: (file: File) => Promise<Blob>;
  labels: UploadLabels;
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: number | null;
  uploadError?: ImageUploadErrorKey | null;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}) {
  const t = useTranslations("ImageUpload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [rejectedFile, setRejectedFile] = useState<{ name: string; size: number } | null>(null);
  const [localError, setLocalError] = useState<LocalError | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!value.pending) {
      // Object URLs are external resources whose lifecycle follows the picked file.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(value.pending);
    setPreview({ blob: value.pending, url });
    return () => URL.revokeObjectURL(url);
  }, [value.pending]);

  const previewUrl =
    value.pending && preview?.blob === value.pending ? preview.url : null;
  const src = previewUrl ?? (!value.pending && value.fileId ? `/api/files/${value.fileId}` : null);
  const hasImage = Boolean(value.pending || value.fileId);
  const busy = Boolean(disabled || uploading || processing);
  const fileName = value.fileName || t("savedImage");
  const fileSize = value.fileSize == null ? null : formatFileSize(value.fileSize);
  const statusText = uploadError
    ? t("failed")
    : uploading
      ? t("uploading")
      : processing
        ? t("preparing")
        : value.pending
          ? t("ready")
          : t("uploaded");
  const attachmentState = uploadError
    ? "error"
    : uploading
      ? "uploading"
      : processing
        ? "processing"
        : value.pending
          ? "idle"
          : "done";

  function showLocalError(error: LocalError, file: File) {
    setRejectedFile({ name: file.name, size: file.size });
    setLocalError(error);
  }

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    setLocalError(null);
    setRejectedFile(null);
    onUploadErrorClear?.();

    const validationError = getImageFileValidationError(file);
    if (validationError) {
      showLocalError(validationError, file);
      return;
    }

    setProcessing(true);
    try {
      const prepared = await prepareImage(file);
      if (prepared.size === 0) {
        showLocalError("unreadable", file);
        return;
      }
      if (prepared.size > MAX_FILE_BYTES) {
        showLocalError("outputTooLarge", file);
        return;
      }
      onChange({
        fileId: value.fileId,
        pending: prepared,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch {
      showLocalError("unreadable", file);
    } finally {
      setProcessing(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    if (event.dataTransfer.files.length > 1) {
      const file = event.dataTransfer.files[0];
      if (file) showLocalError("singleFileOnly", file);
      return;
    }
    void handleFile(event.dataTransfer.files[0]);
  }

  function removeImage() {
    setLocalError(null);
    setRejectedFile(null);
    onUploadErrorClear?.();
    if (value.pending) {
      onChange({
        fileId: value.fileId,
        pending: null,
        fileName: null,
        fileSize: null,
      });
      return;
    }
    onChange({ fileId: null, pending: null });
  }

  function getLocalErrorMessage(error: LocalError) {
    switch (error) {
      case "empty":
        return t("emptyFile");
      case "tooLarge":
        return t("sourceTooLarge", { max: formatFileSize(MAX_SOURCE_BYTES) });
      case "unsupported":
        return t("unsupported");
      case "unreadable":
        return t("unreadable");
      case "outputTooLarge":
        return t("outputTooLarge", { max: formatFileSize(MAX_FILE_BYTES) });
      case "singleFileOnly":
        return t("singleFileOnly");
    }
  }

  function getUploadErrorMessage(error: ImageUploadErrorKey) {
    switch (error) {
      case "invalid":
        return t("serverRejected");
      case "too_large":
        return t("serverTooLarge");
      case "forbidden":
        return t("uploadForbidden");
      case "rate_limited":
        return t("rateLimited");
      case "temporarily_unavailable":
        return t("temporarilyUnavailable");
      case "storage":
      case "network":
      case "invalid_response":
      case "aborted":
        return t("uploadFailed");
    }
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2",
        dragging && "rounded-lg ring-2 ring-primary/50",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      {hasImage ? (
        <Attachment state={attachmentState} aria-busy={busy || undefined}>
          <AttachmentMedia variant={src ? "image" : "icon"}>
            {src ? (
              // Images are local previews or authenticated same-origin files.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={labels.imageAlt} />
            ) : uploading || processing ? (
              <Spinner aria-label={statusText} />
            ) : (
              <ImagePlus aria-label={labels.noImage} />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle title={fileName}>{fileName}</AttachmentTitle>
            <AttachmentDescription>
              {[fileSize, statusText].filter(Boolean).join(" · ")}
            </AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <Button
              id={id}
              type="button"
              variant="outline"
              size="sm"
              aria-label={labels.replace}
              aria-invalid={ariaInvalid || undefined}
              aria-describedby={ariaDescribedBy}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {labels.replace}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={value.pending ? t("discardSelected") : labels.remove}
              disabled={busy}
              onClick={removeImage}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </AttachmentActions>
        </Attachment>
      ) : (
        <Empty
          className={cn(
            "min-h-0 flex-none gap-3 border border-dashed p-4 transition-colors",
            dragging && "border-primary bg-primary-muted/40",
          )}
        >
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon">
              <ImagePlus />
              <span className="sr-only" role="img" aria-label={labels.noImage} />
            </EmptyMedia>
            <EmptyTitle className="text-sm">{labels.emptyTitle}</EmptyTitle>
            <EmptyDescription className="text-xs">
              {labels.emptyDescription}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              id={id}
              aria-label={labels.choose}
              aria-invalid={ariaInvalid || undefined}
              aria-describedby={ariaDescribedBy}
              disabled={busy}
              aria-busy={processing || undefined}
              onClick={() => inputRef.current?.click()}
            >
              {processing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Upload data-icon="inline-start" />
              )}
              {processing ? t("preparing") : labels.choose}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {processing && hasImage && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {t("preparing")}
        </p>
      )}

      {uploading && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{uploadProgress === 100 ? t("processingUpload") : t("uploading")}</span>
            {uploadProgress !== null && <span>{uploadProgress}%</span>}
          </div>
          {uploadProgress !== null && (
            <Progress
              value={uploadProgress}
              aria-label={t("progressLabel")}
              aria-valuetext={t("progressValue", { percent: uploadProgress })}
            />
          )}
        </div>
      )}

      {rejectedFile && localError && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertTitle>{t("invalidTitle")}</AlertTitle>
          <AlertDescription className="min-w-0">
            <span className="block truncate" title={rejectedFile.name}>
              {rejectedFile.name} · {formatFileSize(rejectedFile.size)}
            </span>
            <span>{getLocalErrorMessage(localError)}</span>
          </AlertDescription>
        </Alert>
      )}

      {uploadError && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertTitle>{t("uploadErrorTitle")}</AlertTitle>
          <AlertDescription>
            {getUploadErrorMessage(uploadError)} {t("retryHint")}
          </AlertDescription>
        </Alert>
      )}

      <input
        ref={inputRef}
        id={`${id}-input`}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="image-upload-input"
        disabled={busy}
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
