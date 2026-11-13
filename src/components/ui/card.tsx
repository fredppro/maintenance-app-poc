import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const cardVariants = cva(
  'text-card-foreground flex flex-col rounded-xl border',
  {
    variants: {
      variant: {
        default: 'border-border bg-card shadow-sm',
        elevated: 'border-border-strong bg-surface-elevated shadow-md',
        technical: 'border-border-strong bg-surface-muted shadow-none',
      },
      density: {
        default: 'gap-section py-6',
        compact: 'gap-form py-4 [&>[data-slot=card-header]]:px-4 [&>[data-slot=card-content]]:px-4 [&>[data-slot=card-footer]]:px-4',
      },
      layout: {
        default: '',
        sectioned: 'gap-0 overflow-hidden py-0 [&>[data-slot=card-header]]:border-b [&>[data-slot=card-header]]:bg-muted/30 [&>[data-slot=card-header]]:p-4 [&>[data-slot=card-content]]:p-4 [&>[data-slot=card-header]_[data-slot=card-title]]:text-sm [&>[data-slot=card-header]_[data-slot=card-title]]:leading-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      density: 'default',
      layout: 'default',
    },
  },
)

function Card({
  className,
  variant,
  density,
  layout,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-variant={variant ?? 'default'}
      data-density={density ?? 'default'}
      data-layout={layout ?? 'default'}
      className={cn(cardVariants({ variant, density, layout }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-base leading-6 font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm leading-relaxed text-pretty', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}
