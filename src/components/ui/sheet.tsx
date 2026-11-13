'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { Slot } from '@radix-ui/react-slot'
import { XIcon } from 'lucide-react'

import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150 ease-motion-out data-[state=closed]:ease-motion-in fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  variant = 'inset',
  closeLabel = 'Close',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  variant?: 'default' | 'inset'
  closeLabel?: string
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        data-variant={variant}
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex max-h-dvh flex-col gap-0 overflow-hidden shadow-lg transition-transform duration-150 ease-motion-out data-[state=closed]:duration-150 data-[state=closed]:ease-motion-in data-[state=open]:duration-250',
          side === 'right' &&
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-dvh w-full border-l sm:max-w-sm',
          side === 'left' &&
          'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-dvh w-full border-r sm:max-w-sm',
          side === 'top' &&
          'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
          variant === 'inset' &&
          'sm:max-h-[calc(100dvh-2*var(--sheet-inset))] sm:rounded-sheet sm:border',
          variant === 'inset' && (side === 'right' || side === 'left') &&
          'sm:inset-y-sheet-inset sm:h-auto sm:w-[calc(100%-2*var(--sheet-inset))]',
          variant === 'inset' && side === 'right' && 'sm:right-sheet-inset',
          variant === 'inset' && side === 'left' && 'sm:left-sheet-inset',
          variant === 'inset' && (side === 'top' || side === 'bottom') && 'sm:inset-x-sheet-inset',
          variant === 'inset' && side === 'top' && 'sm:top-sheet-inset',
          variant === 'inset' && side === 'bottom' && 'sm:bottom-sheet-inset',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close asChild>
          <IconButton
            label={closeLabel}
            variant="ghost"
            size="sm"
            className="absolute top-3 right-3"
          >
            <XIcon />
          </IconButton>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex shrink-0 flex-col gap-2 px-page pb-4 pt-5 sm:px-page-desktop', className)}
      {...props}
    />
  )
}

function SheetBody({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'div'
  return (
    <Comp
      data-slot="sheet-body"
      className={cn('relative flex min-h-0 flex-1 flex-col gap-section overflow-y-auto overscroll-contain px-page py-5 sm:px-page-desktop sm:py-6', className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 px-page py-4 sm:px-page-desktop', className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground break-words pr-9 font-semibold', className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground break-words text-sm', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
