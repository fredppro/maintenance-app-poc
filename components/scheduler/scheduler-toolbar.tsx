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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const viewModeOrder: ViewMode[] = ['day', 'week', 'month', 'year']

export function SchedulerToolbar() {
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
        return format(currentDate, 'EEEE, MMMM d, yyyy')
      case 'week':
        return format(currentDate, "'Week of' MMMM d, yyyy")
      case 'month':
        return format(currentDate, 'MMMM yyyy')
      case 'year':
        return format(currentDate, 'yyyy')
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
              <TooltipContent>Today</TooltipContent>
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
              {mode}
            </Button>
          ))}
        </ButtonGroup>

        {/* Right side: Zoom Controls */}
        <div className="flex items-center gap-4 min-w-[240px]">
          <div className="flex items-center gap-2 flex-1">
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
            <Slider
              value={[zoomLevel]}
              min={0.5}
              max={4}
              step={0.1}
              onValueChange={(val) => setZoomLevel(val[0])}
              className="w-full"
            />
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-medium text-muted-foreground w-8">
            {Math.round(zoomLevel * 100)}%
          </span>
        </div>
      </div>
    </TooltipProvider>
  )
}
