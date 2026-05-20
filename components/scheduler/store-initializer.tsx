'use client'

import { useEffect } from 'react'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { Equipment, MaintenanceEntry, Worker } from '@/lib/scheduler-types'

interface StoreInitializerProps {
  equipment: Equipment[]
  entries: MaintenanceEntry[]
  workers: Worker[]
}

export function StoreInitializer({ equipment, entries, workers }: StoreInitializerProps) {
  const setEquipment = useSchedulerStore((state) => state.setEquipment)
  const setEntries = useSchedulerStore((state) => state.setEntries)
  const setWorkers = useSchedulerStore((state) => state.setWorkers)

  useEffect(() => {
    setEquipment(equipment)
    setEntries(entries)
    setWorkers(workers)
  }, [equipment, entries, workers, setEquipment, setEntries, setWorkers])

  return null
}
