import { SchedulerDashboard } from '@/components/scheduler/scheduler-dashboard'
import { StoreInitializer } from '@/components/scheduler/store-initializer'
import { AppLocale, localeSchema } from '@/i18n/locale';
import { getEquipment, getTasks, getWorkers } from '@/lib/actions'
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function Home({
  params
}: {
  params: Promise<{locale: AppLocale}>;
}) {
  const {locale} = await params;

  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) {
    notFound();
  }
  
  setRequestLocale(locale);

  const [equipment, tasks, workers] = await Promise.all([
    getEquipment(),
    getTasks(),
    getWorkers(),
  ])

  // Capture server-side "now" to sync with client hydration
  const serverNow = new Date()

  return (
    <>
      <StoreInitializer 
        equipment={equipment} 
        entries={tasks} 
        workers={workers} 
        initialDate={serverNow}
      />
      <SchedulerDashboard />
    </>
  )
}
