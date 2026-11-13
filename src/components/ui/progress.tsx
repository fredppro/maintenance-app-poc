'use client'

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'
import { semanticTones, type SemanticTone } from './semantic-tones'

function Progress({
  className,
  value,
  tone,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { tone?: SemanticTone }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-tone={tone ?? 'primary'}
      value={value}
      className={cn(
        'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
        tone && semanticTones[tone].track,
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn('h-full w-full flex-1 transition-transform', tone ? semanticTones[tone].indicator : 'bg-primary')}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
