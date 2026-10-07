"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { switchTenantContext } from "@/features/organization/server/actions";

export type TenantContextOption = {
  organizationId: string;
  organizationName: string;
  siteId: string;
  siteName: string;
  role: string;
};

export function TenantContextSelector({
  options,
  selectedSiteId,
  label,
}: {
  options: TenantContextOption[];
  selectedSiteId?: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectContext(value: string) {
    const [organizationId, siteId] = value.split(":");
    const selected = options.find(
      (option) =>
        option.organizationId === organizationId && option.siteId === siteId,
    );
    if (!selected) {
      setError("That organization or site is not available to your account.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      await switchTenantContext({ organizationId, siteId });
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not switch the active site. Please try again.");
      setPending(false);
    }
  }

  const selected = options.find((option) => option.siteId === selectedSiteId);

  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-9 w-full min-w-0 max-w-56 truncate rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-10"
        disabled={pending}
        value={
          selected
            ? `${selected.organizationId}:${selected.siteId}`
            : ""
        }
        onChange={(event) => void selectContext(event.currentTarget.value)}
      >
        {!selected && <option value="">Select organization and site</option>}
        {options.map((option) => (
          <option
            key={`${option.organizationId}:${option.siteId}`}
            value={`${option.organizationId}:${option.siteId}`}
          >
            {option.organizationName} — {option.siteName}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="text-destructive">{error}</span>}
    </label>
  );
}
