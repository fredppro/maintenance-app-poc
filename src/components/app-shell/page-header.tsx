import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  layout = "default",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  layout?: "default" | "compact";
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex min-w-0 shrink-0 gap-3",
        layout === "compact"
          ? "flex-row flex-wrap items-center justify-between"
          : "flex-col lg:flex-row lg:items-start lg:justify-between lg:gap-x-4",
      )}
    >
      <div className="min-w-0 max-w-prose flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">{actions}</div>
      )}
    </div>
  );
}

export function PageBody({
  children,
  layout = "default",
}: {
  children: ReactNode;
  layout?: "default" | "workspace";
}) {
  return (
    <div
      data-slot="page-body"
      className={cn(
        "@container/page flex w-full min-w-0 flex-col gap-section p-page sm:p-page-desktop",
        layout === "workspace" && "h-full min-h-0 overflow-y-auto",
      )}
    >
      {children}
    </div>
  );
}

export function PageRegion({
  children,
  width = "full",
}: {
  children: ReactNode;
  width?: "full" | "form";
}) {
  return (
    <div
      data-slot="page-region"
      data-width={width}
      className={cn(
        "@container/page flex w-full min-w-0 flex-col gap-section",
        width === "form" && "max-w-(--content-width-form)",
      )}
    >
      {children}
    </div>
  );
}

export function PageGrid({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="page-grid"
      className="grid min-w-0 grid-cols-1 gap-section @2xl/page:grid-cols-2 @6xl/page:grid-cols-3"
    >
      {children}
    </div>
  );
}
