'use client'

import { useEffect, useRef } from 'react'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { Equipment, MaintenanceEntry, Worker } from '@/lib/scheduler-types'

interface StoreInitializerProps {
  equipment: Equipment[]
  entries: MaintenanceEntry[]
  workers: Worker[]
}

export function StoreInitializer({ equipment, entries, workers }: StoreInitializerProps) {
  const initialized = useRef(false)
  const setEquipment = useSchedulerStore((state) => state.setEquipment)
  const setEntries = useSchedulerStore((state) => state.setEntries)
  const setWorkers = useSchedulerStore((state) => state.setWorkers)

  if (!initialized.current) {
    setEquipment(equipment)
    setEntries(entries)
    setWorkers(workers)
    initialized.current = true
  }

  return null
}
