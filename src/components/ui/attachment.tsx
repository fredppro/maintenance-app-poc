import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type AttachmentState =
  | "idle"
  | "processing"
  | "uploading"
  | "error"
  | "done";

function Attachment({
  className,
  state = "done",
  ...props
}: ComponentProps<"div"> & { state?: AttachmentState }) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground transition-colors",
        "data-[state=uploading]:border-primary/40 data-[state=processing]:border-primary/40 data-[state=error]:border-destructive/50",
        className,
      )}
      {...props}
    />
  );
}

function AttachmentMedia({
  className,
  variant = "icon",
  ...props
}: ComponentProps<"div"> & { variant?: "icon" | "image" }) {
  return (
    <div
      data-slot="attachment-media"
      data-variant={variant}
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground",
        variant === "image" && "[&_img]:size-full [&_img]:object-cover",
        className,
      )}
      {...props}
    />
  );
}

function AttachmentContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-content"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  );
}

function AttachmentTitle({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      data-slot="attachment-title"
      className={cn("truncate text-sm font-medium", className)}
      {...props}
    />
  );
}

function AttachmentDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      data-slot="attachment-description"
      className={cn("mt-1 truncate text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function AttachmentActions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-actions"
      className={cn("flex shrink-0 items-center gap-1", className)}
      {...props}
    />
  );
}

export {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
};
