import { SchedulerDashboard } from '@/components/scheduler/scheduler-dashboard'
import { StoreInitializer } from '@/components/scheduler/store-initializer'
import { getEquipment, getTasks } from '@/lib/actions'

export default async function Home() {
  const [equipment, tasks] = await Promise.all([
    getEquipment(),
    getTasks(),
  ])

  return (
    <>
      <StoreInitializer equipment={equipment} entries={tasks} />
      <SchedulerDashboard />
    </>
  )
}
