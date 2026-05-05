'use client'

import { useSchedulerStore } from '@/lib/scheduler-store'
import { ViewMode } from '@/lib/scheduler-types'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
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
    setViewMode,
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
    const currentIndex = viewModeOrder.indexOf(viewMode)
    if (currentIndex > 0) {
      setViewMode(viewModeOrder[currentIndex - 1])
    }
  }

  const handleZoomOut = () => {
    const currentIndex = viewModeOrder.indexOf(viewMode)
    if (currentIndex < viewModeOrder.length - 1) {
      setViewMode(viewModeOrder[currentIndex + 1])
    }
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const canZoomIn = viewModeOrder.indexOf(viewMode) > 0
  const canZoomOut = viewModeOrder.indexOf(viewMode) < viewModeOrder.length - 1

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
            <span className="font-medium text-foreground min-w-48">
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
            >
              {mode}
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
              <TooltipContent>Zoom In (more detail)</TooltipContent>
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
              <TooltipContent>Zoom Out (less detail)</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>
    </TooltipProvider>
  )
}
