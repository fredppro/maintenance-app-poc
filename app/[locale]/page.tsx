import { SchedulerDashboard } from '@/components/scheduler/scheduler-dashboard'
import { StoreInitializer } from '@/components/scheduler/store-initializer'
import { getEquipment, getTasks, getWorkers } from '@/lib/actions'
import { setRequestLocale } from 'next-intl/server';

export default async function Home({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  // Enable static rendering
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
