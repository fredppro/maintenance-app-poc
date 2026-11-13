import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm leading-5 font-medium tracking-ui outline-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-motion-out aria-busy:cursor-wait aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:pointer-events-none [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:hover:bg-primary disabled:active:bg-primary',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 disabled:hover:bg-destructive disabled:active:bg-destructive focus-visible:ring-destructive/30',
        'destructive-outline':
          'border border-destructive/50 bg-transparent text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground active:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/30 disabled:hover:border-destructive/50 disabled:hover:bg-transparent disabled:hover:text-destructive',
        'destructive-ghost':
          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 focus-visible:ring-destructive/30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
        outline:
          'border border-input bg-background text-foreground shadow-xs hover:border-ring/50 hover:bg-accent hover:text-accent-foreground active:bg-accent/80 active:shadow-none disabled:hover:border-input disabled:hover:bg-background disabled:hover:text-foreground disabled:active:bg-background disabled:active:shadow-xs',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 disabled:hover:bg-secondary disabled:active:bg-secondary',
        ghost:
          'hover:bg-accent hover:text-accent-foreground active:bg-accent/80 disabled:hover:bg-transparent',
        link: 'text-link underline-offset-4 hover:text-link-hover hover:underline active:text-link-hover disabled:hover:no-underline disabled:active:text-link',
      },
      size: {
        default: 'h-control px-4 py-2 pointer-coarse:h-control-lg',
        sm: 'h-control-sm rounded-control-sm gap-1.5 px-3 pointer-coarse:h-control-lg',
        xs: 'h-control-xs rounded-control-sm gap-1.5 px-2 text-xs pointer-coarse:h-control-lg',
        lg: 'h-control-lg px-6',
        icon: 'size-control pointer-coarse:size-control-lg',
        'icon-sm': 'size-control-sm rounded-control-sm pointer-coarse:size-control-lg',
        'icon-xs': 'size-control-xs rounded-control-sm pointer-coarse:size-control-lg',
        'icon-lg': 'size-control-lg',
        row: 'h-auto min-h-control justify-start gap-3 whitespace-normal rounded-md px-2 py-2 text-left pointer-coarse:min-h-control-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      data-size={size ?? 'default'}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
