import { SchedulerDashboard } from "@/features/scheduler/ui/scheduler-dashboard";
import { AppLocale, localeSchema } from "src/i18n/locale";
import { getEquipment, getTasks } from "@/features/scheduler/server/actions";
import { getWorkers } from "@/features/worker/server/actions";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) {
    notFound();
  }

  setRequestLocale(locale);

  const [equipment, tasks, workers] = await Promise.all([
    getEquipment(),
    getTasks(),
    getWorkers(),
  ]);

  // Capture server-side "now" to sync with client hydration
  const serverNow = new Date();

  return (
    <SchedulerStoreProvider
      initialState={{
        equipment,
        entries: tasks,
        workers,
        currentDate: serverNow,
      }}
    >
      <SchedulerDashboard />
    </SchedulerStoreProvider>
  );
}

