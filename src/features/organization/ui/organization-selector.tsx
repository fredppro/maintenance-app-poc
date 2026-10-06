"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { switchActiveOrganization } from "@/features/organization/server/actions";

export function OrganizationSelector({
  organizations,
}: {
  organizations: { id: string; name: string }[];
}) {
  const t = useTranslations("OrganizationSelection");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function select(organizationId: string) {
    setError(false);
    setPending(true);
    try {
      await switchActiveOrganization({ organizationId });
      router.replace("/onboarding");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <label className="flex w-full max-w-md flex-col gap-2 text-sm">
      <span className="font-medium">{t("label")}</span>
      <select
        aria-label={t("label")}
        className="h-10 rounded-md border border-input bg-background px-3 text-foreground"
        defaultValue=""
        disabled={pending}
        onChange={(event) => void select(event.currentTarget.value)}
      >
        <option value="" disabled>{t("placeholder")}</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="text-destructive">{t("error")}</span>}
    </label>
  );
}
