"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { switchTenantContext } from "@/features/organization/server/actions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  displayOrganizationName = true,
}: {
  options: TenantContextOption[];
  selectedSiteId?: string;
  label: string;
  displayOrganizationName?: boolean;
}) {
  const t = useTranslations("OrganizationSelection");
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
      setError(t("tenantContextUnavailable"));
      return;
    }

    setError(null);
    setPending(true);
    try {
      await switchTenantContext({ organizationId, siteId });
      router.replace("/");
      router.refresh();
    } catch {
      setError(t("tenantContextSwitchError"));
      setPending(false);
    }
  }

  const selected = options.find((option) => option.siteId === selectedSiteId);

  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="sr-only">{label}</span>
      <Select
        disabled={pending}
        value={
          selected
            ? `${selected.organizationId}:${selected.siteId}`
            : undefined
        }
        onValueChange={(value) => void selectContext(value)}
      >
        <SelectTrigger
          aria-label={label}
          className="w-full min-w-0 max-w-56"
        >
          <SelectValue
            placeholder={
              displayOrganizationName
                ? t("tenantContextPlaceholder")
                : t("siteSelectionPlaceholder")
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                key={`${option.organizationId}:${option.siteId}`}
                value={`${option.organizationId}:${option.siteId}`}
              >
                {displayOrganizationName
                  ? `${option.organizationName} — ${option.siteName}`
                  : option.siteName}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && <span role="alert" className="text-destructive">{error}</span>}
    </label>
  );
}
