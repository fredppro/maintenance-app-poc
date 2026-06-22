'use client'

import { useSchedulerStore } from '@/lib/scheduler-store'
import { ViewMode } from '@/lib/scheduler-types'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Slider } from '@/components/ui/slider'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react'
import { format } from 'date-fns'
import { enUS, pt } from 'date-fns/locale'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

const viewModeOrder: ViewMode[] = ['day', 'week', 'month', 'year']

export function SchedulerToolbar() {
  const locale = useLocale()
  const t = useTranslations('Toolbar')
  
  const dateFnsLocale = useMemo(() => {
    return locale === 'pt-pt' ? pt : enUS
  }, [locale])

  const {
    viewMode,
    currentDate,
    zoomLevel,
    setViewMode,
    setZoomLevel,
    setCurrentDate,
    navigateForward,
    navigateBackward,
  } = useSchedulerStore()

  const formatDateRange = () => {
    switch (viewMode) {
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy', { locale: dateFnsLocale })
      case 'week':
        const weekPrefix = locale === 'pt-pt' ? "'Semana de' " : "'Week of' "
        return format(currentDate, `${weekPrefix}MMMM d, yyyy`, { locale: dateFnsLocale })
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: dateFnsLocale })
      case 'year':
        return format(currentDate, 'yyyy', { locale: dateFnsLocale })
    }
  }

  const handleZoomIn = () => {
    setZoomLevel(Math.min(zoomLevel + 0.5, 4))
  }

  const handleZoomOut = () => {
    setZoomLevel(Math.max(zoomLevel - 0.5, 0.5))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between gap-4 p-4 bg-card border border-border rounded-lg">
        {/* Left side: Navigation */}
        <div className="flex items-center gap-2">
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={navigateBackward}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleToday}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('today')}</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={navigateForward}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next</TooltipContent>
            </Tooltip>
          </ButtonGroup>

          <div className="flex items-center gap-2 px-3">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-foreground min-w-48 text-sm">
              {formatDateRange()}
            </span>
          </div>
        </div>

        {/* Center: View Mode Buttons */}
        <ButtonGroup>
          {viewModeOrder.map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? 'default' : 'outline'}
              onClick={() => setViewMode(mode)}
              className="capitalize"
              size="sm"
            >
              {t(mode)}
            </Button>
          ))}
        </ButtonGroup>

        {/* Right side: Zoom Controls */}
        <div className="flex items-center gap-2">
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={!canZoomIn}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom In</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={!canZoomOut}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom Out</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>
    </TooltipProvider>
  )
}
