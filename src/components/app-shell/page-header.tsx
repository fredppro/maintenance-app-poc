import type { ReactNode } from "react";

/** Standard page heading + primary action row used by every non-schedule page. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-x-4">
      <div className="min-w-0 max-w-prose flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 lg:shrink-0">{actions}</div>
      )}
    </div>
  );
}

/** Scrollable, width-constrained content area for list/detail pages. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-6">
      {children}
    </div>
  );
}
