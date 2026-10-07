"use client";

import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  createSection,
  createSite,
  deleteSection,
  renameSection,
} from "@/features/scheduler/server/actions";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";

function SectionRow({
  id,
  name,
  count,
}: {
  id: string;
  name: string;
  count: number;
}) {
  const t = useTranslations("SitesPage");
  const tCommon = useTranslations("Common");
  const sections = useSchedulerStore((s) => s.sections);
  const setSections = useSchedulerStore((s) => s.setSections);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      try {
        const updated = await renameSection(id, value);
        setSections(sections.map((s) => (s.id === id ? updated : s)));
        setEditing(false);
      } catch {
        toast.error(t("failed"));
      }
    });
  const remove = () =>
    start(async () => {
      try {
        await deleteSection(id);
        setSections(sections.filter((s) => s.id !== id));
      } catch {
        toast.error(t("failed"));
      }
    });

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      {editing ? (
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("rename")}
            autoFocus
          />
          <Button type="submit" disabled={pending || !value.trim()}>
            {t("save")}
          </Button>
        </form>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{name}</span>
            <Badge variant="outline">
              {t("equipmentCount", { count })}
            </Badge>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t("rename")} ${name}`}
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t("delete")} ${name}`}
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
            </Button>
          </div>
        </>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function AddSite() {
  const t = useTranslations("SitesPage");
  const addSite = useSchedulerStore((s) => s.addSite);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        start(async () => {
          try {
            const site = await createSite(name);
            addSite({ ...site, current: false });
            setName("");
            toast.success(t("siteAdded"));
          } catch {
            toast.error(t("siteFailed"));
          }
        });
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("newSite")}
        aria-label={t("newSite")}
      />
      <Button type="submit" disabled={pending || !name.trim()}>
        <Plus data-icon="inline-start" />
        {t("addSite")}
      </Button>
    </form>
  );
}

function AddSection({ siteId }: { siteId: string }) {
  const t = useTranslations("SitesPage");
  const addSection = useSchedulerStore((s) => s.addSection);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        start(async () => {
          try {
            addSection(await createSection(siteId, name));
            setName("");
          } catch {
            toast.error(t("failed"));
          }
        });
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("newSection")}
        aria-label={t("newSection")}
      />
      <Button type="submit" variant="secondary" disabled={pending || !name.trim()}>
        <Plus data-icon="inline-start" />
        {t("addSection")}
      </Button>
    </form>
  );
}

export function SitesPageClient() {
  const t = useTranslations("SitesPage");
  const sites = useSchedulerStore((s) => s.sites);
  const sections = useSchedulerStore((s) => s.sections);
  const equipment = useSchedulerStore((s) => s.equipment);

  return (
    <PageBody>
      <PageHeader title={t("title")} description={t("description")} />
      <AddSite />
      {sites.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPin />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sites.map((site) => {
            const own = sections.filter((s) => s.siteId === site.id);
            return (
              <Card key={site.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {site.name}
                    {site.current && <Badge>{t("current")}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {site.current
                      ? t("equipmentCount", { count: equipment.length })
                      : t("sections")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {own.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("noSections")}
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {own.map((s) => (
                        <SectionRow
                          key={s.id}
                          id={s.id}
                          name={s.name}
                          count={
                            equipment.filter((e) => e.sectionId === s.id).length
                          }
                        />
                      ))}
                    </ul>
                  )}
                  <AddSection siteId={site.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageBody>
  );
}
