'use client'

import { useEffect, useRef } from 'react'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { Equipment, MaintenanceEntry, Worker } from '@/lib/scheduler-types'

interface StoreInitializerProps {
  equipment: Equipment[]
  entries: MaintenanceEntry[]
  workers: Worker[]
  initialDate?: Date
}

export function StoreInitializer({ equipment, entries, workers, initialDate }: StoreInitializerProps) {
  const setEquipment = useSchedulerStore((state) => state.setEquipment)
  const setEntries = useSchedulerStore((state) => state.setEntries)
  const setWorkers = useSchedulerStore((state) => state.setWorkers)
  const setCurrentDate = useSchedulerStore((state) => state.setCurrentDate)
  
  // Use a ref to ensure we only sync the initial date once to avoid overriding user navigation
  const dateSynced = useRef(false)

  useEffect(() => {
    setEquipment(equipment)
    setEntries(entries)
    setWorkers(workers)
    
    if (initialDate && !dateSynced.current) {
      setCurrentDate(new Date(initialDate))
      dateSynced.current = true
    }
  }, [equipment, entries, workers, initialDate, setEquipment, setEntries, setWorkers, setCurrentDate])

  return null
}
