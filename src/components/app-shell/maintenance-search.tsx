"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import { searchSchedule } from "@/features/scheduler/utils/search-schedule";
import { MaintenanceStatusBadge } from "@/features/scheduler/ui/maintenance-status-badge";
import { useRouter } from "@/i18n/routing";

const subscribePlatform = () => () => {};
const isApplePlatform = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function MaintenanceSearch() {
  const t = useTranslations("Search");
  const tGrid = useTranslations("Grid");
  const format = useFormatter();
  const router = useRouter();
  const entries = useSchedulerStore((state) => state.entries);
  const equipment = useSchedulerStore((state) => state.equipment);
  const timeZone = useSchedulerStore((state) => state.timeZone);
  const query = useSchedulerStore((state) => state.searchQuery);
  const setQuery = useSchedulerStore((state) => state.setSearchQuery);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const apple = useSyncExternalStore(subscribePlatform, isApplePlatform, () => false);
  const results = useMemo(
    () => searchSchedule(entries, equipment, query).entries,
    [entries, equipment, query],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.repeat) return;
      // Do not stack the global palette over an active editing or confirmation dialog.
      if (!open && document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          aria-label={tGrid("searchTasks")}
          aria-keyshortcuts={apple ? "Meta+K" : "Control+K"}
          className="w-control justify-start gap-2 px-0 pointer-coarse:min-w-control-lg @xl/shell:w-44 @xl/shell:px-control-padding @2xl/shell:w-56 @5xl/shell:w-72"
        >
          <Search data-icon="inline-start" className="mx-auto text-muted-foreground @xl/shell:mx-0" />
          <span className="hidden min-w-0 flex-1 truncate text-left font-normal text-muted-foreground @xl/shell:block">
            {query || t("placeholder")}
          </span>
          <Kbd className="hidden shrink-0 @xl/shell:inline-flex">{apple ? "⌘K" : "Ctrl+K"}</Kbd>
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} label={tGrid("searchTasks")}>
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={tGrid("searchTasks")}
            aria-label={tGrid("searchTasks")}
          />
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
            <span role="status">{tGrid("searchResultCount", { count: results.length })}</span>
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <X data-icon="inline-start" />
                {tGrid("clearSearch")}
              </Button>
            )}
          </div>
          <CommandList aria-label={tGrid("searchResults")}>
            <CommandEmpty>{tGrid("noSearchResults")}</CommandEmpty>
            <CommandGroup heading={t("results")}>
              {results.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  className="gap-3 px-3 py-3"
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/?taskId=${encodeURIComponent(entry.id)}`);
                  }}
                >
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate font-medium">{entry.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {equipment.find((item) => item.id === entry.equipmentId)?.name ?? tGrid("equipment")}
                      {" · "}
                      {format.dateTime(new Date(entry.startTime), {
                        dateStyle: "medium", timeStyle: "short", timeZone,
                      })}
                    </span>
                  </span>
                  <MaintenanceStatusBadge status={entry.status} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center justify-between gap-3 border-t px-3 py-3 text-xs text-muted-foreground">
          <span>{t("keyboardHint")}</span>
          <span><Kbd>Esc</Kbd> {t("close")}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
