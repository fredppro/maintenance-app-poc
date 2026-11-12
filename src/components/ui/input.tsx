import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, controlSize = 'default', variant = 'default', ...props }: React.ComponentProps<'input'> & {
  controlSize?: 'default' | 'sm'
  variant?: 'default' | 'inline'
}) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={controlSize}
      data-variant={variant}
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-control w-full min-w-0 rounded-control border bg-background px-control-padding py-2 text-base leading-5 tracking-ui shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pointer-coarse:h-control-lg data-[size=sm]:h-control-sm data-[size=sm]:rounded-control-sm pointer-coarse:data-[size=sm]:h-control-lg',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        variant === 'inline' && 'border-transparent bg-transparent px-1 shadow-none',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
