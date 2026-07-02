"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APPLICATION_LOCALES } from "@/i18n/config";
import { AppLocale, getValidLocale } from "@/i18n/locale";
import { usePathname, useRouter } from "@/i18n/routing";
import { Languages } from "lucide-react";
import { useLocale } from "next-intl";

export default function LanguageSwitcher() {
  const currentLocale = getValidLocale(useLocale());
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
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Toggle language</span>
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
