import * as React from 'react'

import { Button } from '@/components/ui/button'

const variantMap = {
  primary: 'default',
  secondary: 'secondary',
  outline: 'outline',
  ghost: 'ghost',
  danger: 'destructive-ghost',
} as const

type IconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'variant' | 'size' | 'aria-label'
> & {
  /** Accessible name; icon-only controls must always have one. */
  label: string
  variant?: keyof typeof variantMap
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'icon-sm', md: 'icon', lg: 'icon-lg' } as const

/** Icon-only Button with a required label, built on the shared Button variants. */
function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <Button
      type={type}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      aria-label={label}
      title={label}
      {...props}
    />
  )
}

export { IconButton }
export type { IconButtonProps }
