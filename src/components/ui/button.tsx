import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-out aria-busy:cursor-wait aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:hover:bg-primary disabled:active:bg-primary',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 disabled:hover:bg-destructive disabled:active:bg-destructive focus-visible:ring-destructive/30',
        'destructive-outline':
          'border border-destructive/50 bg-transparent bg-gradient-to-r from-destructive to-destructive bg-[length:0%_100%] bg-left bg-no-repeat text-destructive transition-[background-size,color,border-color,box-shadow] duration-300 hover:border-destructive hover:bg-[length:100%_100%] hover:text-destructive-foreground active:brightness-90 focus-visible:border-destructive focus-visible:ring-destructive/30 disabled:hover:border-destructive/50 disabled:hover:bg-[length:0%_100%] disabled:hover:text-destructive motion-reduce:transition-none',
        'destructive-ghost':
          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 focus-visible:ring-destructive/30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
        outline:
          'border border-input bg-background text-foreground shadow-xs hover:border-ring/50 hover:bg-accent hover:text-accent-foreground active:bg-accent/80 active:shadow-none disabled:hover:border-input disabled:hover:bg-background disabled:hover:text-foreground disabled:active:bg-background disabled:active:shadow-xs',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 disabled:hover:bg-secondary disabled:active:bg-secondary',
        industrial:
          'border border-primary/20 bg-primary-muted text-primary hover:bg-primary/15 active:bg-primary/20 disabled:hover:bg-primary-muted disabled:active:bg-primary-muted',
        ghost:
          'hover:bg-accent hover:text-accent-foreground active:bg-accent/80 disabled:hover:bg-transparent',
        link: 'text-primary underline-offset-4 hover:underline active:text-primary-active disabled:hover:no-underline disabled:active:text-primary',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
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
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
