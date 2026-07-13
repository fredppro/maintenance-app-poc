'use client'

import * as React from 'react'
import { Clock } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface TimePickerProps {
  date: Date
  onChange: (date: Date) => void
  label?: string
}

export function TimePicker({ date, onChange, label }: TimePickerProps) {
  const [hours, setHours] = React.useState(date.getHours().toString().padStart(2, '0'))
  const [minutes, setMinutes] = React.useState(date.getMinutes().toString().padStart(2, '0'))

  // Sync state if date prop changes from outside
  React.useEffect(() => {
    setHours(date.getHours().toString().padStart(2, '0'))
    setMinutes(date.getMinutes().toString().padStart(2, '0'))
  }, [date])

  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(-2)
    setHours(value)
    
    const h = parseInt(value)
    if (!isNaN(h) && h >= 0 && h < 24) {
      const newDate = new Date(date)
      newDate.setHours(h)
      onChange(newDate)
    }
  }

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(-2)
    setMinutes(value)
    
    const m = parseInt(value)
    if (!isNaN(m) && m >= 0 && m < 60) {
      const newDate = new Date(date)
      newDate.setMinutes(m)
      onChange(newDate)
    }
  }

  const onBlur = () => {
    // Pad values on blur
    setHours(prev => prev.padStart(2, '0'))
    setMinutes(prev => prev.padStart(2, '0'))
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label className="text-[10px] uppercase font-bold text-muted-foreground">{label}</Label>}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <Input
            type="text"
            inputMode="numeric"
            value={hours}
            onChange={handleHoursChange}
            onBlur={onBlur}
            className="w-[48px] h-9 text-center p-0 focus-visible:ring-1"
          />
          <span className="mx-1 font-medium">:</span>
          <Input
            type="text"
            inputMode="numeric"
            value={minutes}
            onChange={handleMinutesChange}
            onBlur={onBlur}
            className="w-[48px] h-9 text-center p-0 focus-visible:ring-1"
          />
        </div>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}
