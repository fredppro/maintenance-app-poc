"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APPLICATION_LOCALES } from "src/i18n/config";
import { AppLocale, getValidLocale } from "src/i18n/locale";
import { usePathname, useRouter } from "src/i18n/routing";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

export default function LanguageSwitcher() {
  const currentLocale = getValidLocale(useLocale());
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const pathname = usePathname();

  function onSelectChange(nextLocale: string) {
    // @ts-ignore
    router.replace(pathname, { locale: nextLocale });
  }

  const languages = Object.entries(APPLICATION_LOCALES).map(
    ([code, config]) => ({
      code: code as AppLocale,
      label: config.label,
    }),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Languages aria-hidden="true" />
          <span className="sr-only">{t("toggleLanguage")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => onSelectChange(l.code)}
            className={currentLocale === l.code ? "bg-accent" : ""}
          >
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
