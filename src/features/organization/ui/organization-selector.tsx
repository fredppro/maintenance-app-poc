"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { switchActiveOrganization } from "@/features/organization/server/actions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <Select disabled={pending} onValueChange={(value) => void select(value)}>
        <SelectTrigger aria-label={t("label")} className="w-full">
          <SelectValue placeholder={t("placeholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {organizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && <span role="alert" className="text-destructive">{t("error")}</span>}
    </label>
  );
}
