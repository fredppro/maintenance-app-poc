import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const emptyVariants = cva(
  'flex min-w-0 items-center rounded-lg border-dashed text-balance',
  {
    variants: {
      variant: {
        default: 'flex-1 flex-col justify-center text-center',
        surface: 'flex-1 flex-col justify-center border border-solid bg-card text-center',
        inline: 'flex-none flex-row justify-start border border-solid bg-card text-left [&>[data-slot=empty-icon]]:mb-0 [&>[data-slot=empty-icon]]:size-8 [&>[data-slot=empty-title]]:text-sm',
      },
      size: {
        default: 'gap-section p-6 md:p-12',
        sm: 'flex-none gap-3 p-4 [&_[data-slot=empty-title]]:text-sm',
      },
    },
    compoundVariants: [{ variant: 'inline', className: 'gap-3 p-3 md:p-3' }],
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Empty({ className, variant, size, ...props }: React.ComponentProps<'div'> & VariantProps<typeof emptyVariants>) {
  return (
    <div
      data-slot="empty"
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      className={cn(emptyVariants({ variant, size }), className)}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-header"
      className={cn(
        'flex max-w-sm flex-col items-center gap-2 text-center',
        className,
      )}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  'flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function EmptyMedia({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-title"
      className={cn('text-lg font-medium tracking-tight', className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        'text-muted-foreground [&>a:hover]:text-link-hover text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4',
        className,
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        'flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance',
        className,
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}
