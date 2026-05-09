import { SchedulerDashboard } from '@/components/scheduler/scheduler-dashboard'
import { StoreInitializer } from '@/components/scheduler/store-initializer'
import { getEquipment, getTasks, getWorkers } from '@/lib/actions'

export default async function Home() {
  const [equipment, tasks, workers] = await Promise.all([
    getEquipment(),
    getTasks(),
    getWorkers(),
  ])

  return (
    <>
      <StoreInitializer equipment={equipment} entries={tasks} workers={workers} />
      <SchedulerDashboard />
    </>
  )
}
