'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { MotionConfig, motion } from 'motion/react'

import { cn } from '@/lib/utils'

type TabsIndicatorContextValue = {
  activeValue: string | undefined
  animated: boolean
  layoutId: string
}

const TabsValueContext = React.createContext<string | undefined>(undefined)
const TabsIndicatorContext = React.createContext<TabsIndicatorContextValue | null>(null)

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const activeValue = value ?? uncontrolledValue

  return (
    <TabsValueContext.Provider value={activeValue}>
      <MotionConfig reducedMotion="user">
        <TabsPrimitive.Root
          data-slot="tabs"
          className={cn('flex flex-col gap-2', className)}
          value={value}
          defaultValue={defaultValue}
          onValueChange={(nextValue) => {
            if (value === undefined) setUncontrolledValue(nextValue)
            onValueChange?.(nextValue)
          }}
          {...props}
        />
      </MotionConfig>
    </TabsValueContext.Provider>
  )
}

function TabsList({
  className,
  animated = true,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { animated?: boolean }) {
  const activeValue = React.useContext(TabsValueContext)
  const id = React.useId()

  return (
    <TabsIndicatorContext.Provider value={{ activeValue, animated, layoutId: `tabs-indicator-${id}` }}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(
          'bg-muted text-muted-foreground inline-flex h-control w-fit items-center justify-center gap-1 rounded-control p-1 pointer-coarse:h-control-lg',
          className,
        )}
        {...props}
      />
    </TabsIndicatorContext.Provider>
  )
}

function TabsTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const indicator = React.useContext(TabsIndicatorContext)
  const animated = indicator?.animated ?? false
  const isActive = value === indicator?.activeValue

  return (
    <TabsPrimitive.Trigger
      value={value}
      data-slot="tabs-trigger"
      className={cn(
        'relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-control-inner border px-3 py-1 text-sm leading-5 font-medium tracking-ui whitespace-nowrap focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        animated
          ? 'border-transparent text-muted-foreground transition-[color] duration-150 ease-motion-out'
          : 'border-transparent text-muted-foreground transition-none data-[state=active]:border-input data-[state=active]:bg-background data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    >
      {animated && isActive && indicator && (
        <motion.span
          aria-hidden="true"
          data-slot="tabs-active-indicator"
          layoutId={indicator.layoutId}
          initial={false}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="pointer-events-none absolute inset-0 rounded-control-inner border border-input bg-background shadow-sm"
        />
      )}
      <span className="relative z-10">{children}</span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
