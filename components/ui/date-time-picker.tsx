'use client'

import * as React from 'react'
import { CalendarIcon, Clock } from 'lucide-react'
import { format, setHours, setMinutes } from 'date-fns'
import { enUS, pt } from 'date-fns/locale'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useTranslations } from 'next-intl'

interface DateTimePickerProps {
  date?: Date
  setDate: (date: Date) => void
  locale?: string
  placeholder?: string
}

export function DateTimePicker({ date, setDate, locale, placeholder }: DateTimePickerProps) {
  const t = useTranslations('Form')
  const dateFnsLocale = locale === 'pt-pt' ? pt : enUS

  const [hours, setHoursState] = React.useState(date ? date.getHours().toString().padStart(2, '0') : '00')
  const [minutes, setMinutesState] = React.useState(date ? date.getMinutes().toString().padStart(2, '0') : '00')

  // Sync internal string state when date prop changes
  React.useEffect(() => {
    if (date) {
      setHoursState(date.getHours().toString().padStart(2, '0'))
      setMinutesState(date.getMinutes().toString().padStart(2, '0'))
    }
  }, [date])

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const newDate = new Date(selectedDate)
      newDate.setHours(parseInt(hours))
      newDate.setMinutes(parseInt(minutes))
      setDate(newDate)
    }
  }

  const handleTimeChange = (type: 'hours' | 'minutes', value: string) => {
    // Only allow digits and take the last 2 characters to allow "typing over"
    const cleanValue = value.replace(/\D/g, '')
    const val = cleanValue.slice(-2)
    
    if (type === 'hours') {
      setHoursState(val)
      if (val.length > 0) {
        const h = parseInt(val)
        if (h >= 0 && h < 24 && date) {
          setDate(setHours(new Date(date), h))
        }
      }
    } else {
      setMinutesState(val)
      if (val.length > 0) {
        const m = parseInt(val)
        if (m >= 0 && m < 60 && date) {
          setDate(setMinutes(new Date(date), m))
        }
      }
    }
  }

  const handleBlur = (type: 'hours' | 'minutes') => {
    if (type === 'hours') {
      const h = parseInt(hours) || 0
      const clampedH = Math.min(Math.max(h, 0), 23)
      const finalH = clampedH.toString().padStart(2, '0')
      setHoursState(finalH)
      if (date) setDate(setHours(new Date(date), clampedH))
    } else {
      const m = parseInt(minutes) || 0
      const clampedM = Math.min(Math.max(m, 0), 59)
      const finalM = clampedM.toString().padStart(2, '0')
      setMinutesState(finalM)
      if (date) setDate(setMinutes(new Date(date), clampedM))
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal h-9 px-3',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
          {date ? (
            format(date, 'PPP HH:mm', { locale: dateFnsLocale })
          ) : (
            <span>{placeholder || t('pickDate')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-0 flex flex-col md:flex-row" 
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={20}
      >
        <div className="p-3">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            autoFocus
            locale={dateFnsLocale}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2030, 11)}
          />
        </div>
        <div className="p-3 flex flex-col md:border-l border-t md:border-t-0 border-border gap-4 bg-muted/20 min-w-[120px]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('time')}</span>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 items-start">
              <span className="text-[9px] text-muted-foreground uppercase font-medium px-1">{t('hours')}</span>
              <Input
                value={hours}
                onChange={(e) => handleTimeChange('hours', e.target.value)}
                onBlur={() => handleBlur('hours')}
                onFocus={(e) => e.target.select()}
                className="w-16 h-8 text-center p-0 text-xs focus-visible:ring-1 bg-background"
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-col gap-1 items-start">
              <span className="text-[9px] text-muted-foreground uppercase font-medium px-1">{t('minutes')}</span>
              <Input
                value={minutes}
                onChange={(e) => handleTimeChange('minutes', e.target.value)}
                onBlur={() => handleBlur('minutes')}
                onFocus={(e) => e.target.select()}
                className="w-16 h-8 text-center p-0 text-xs focus-visible:ring-1 bg-background"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
