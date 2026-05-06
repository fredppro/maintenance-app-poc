'use client'

import { useEffect, useRef } from 'react'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { Equipment, MaintenanceEntry } from '@/lib/scheduler-types'

interface StoreInitializerProps {
  equipment: Equipment[]
  entries: MaintenanceEntry[]
}

export function StoreInitializer({ equipment, entries }: StoreInitializerProps) {
  const initialized = useRef(false)
  const setEquipment = useSchedulerStore((state) => state.setEquipment)
  const setEntries = useSchedulerStore((state) => state.setEntries)

  if (!initialized.current) {
    setEquipment(equipment)
    setEntries(entries)
    initialized.current = true
  }

  return null
}
