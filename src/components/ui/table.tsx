'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import {
  Reorderable,
  ReorderableHandle,
  ReorderableItem,
  type ReorderingOptions,
} from './reorderable'

function TableSurface({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="table-surface" className={cn('overflow-hidden rounded-lg border bg-card', className)} {...props} />
}

function Table({ className, reordering, ...props }: React.ComponentProps<'table'> & { reordering?: ReorderingOptions }) {
  const content = (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm leading-5 tracking-ui', className)}
        {...props}
      />
    </div>
  )
  return reordering ? <Reorderable {...reordering}>{content}</Reorderable> : content
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-muted [&_tr]:h-10 [&_tr]:border-b', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('bg-background [&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'bg-muted/50 border-t font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, reorderId, ...props }: React.ComponentProps<'tr'> & { reorderId?: string }) {
  const row = (
    <tr
      data-slot="table-row"
      className={cn(
        'h-table-row hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  )
  return reorderId === undefined ? row : <ReorderableItem id={reorderId}>{row}</ReorderableItem>
}

function TableHead({
  className,
  scope = 'col',
  numeric = false,
  ...props
}: React.ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      scope={scope}
      data-slot="table-head"
      className={cn(
        'text-foreground h-10 px-table-cell text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, numeric = false, ...props }: React.ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-table-cell py-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted-foreground mt-4 text-sm', className)}
      {...props}
    />
  )
}

function TableEmptyRow({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 whitespace-normal text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  )
}

export {
  TableSurface,
  TableEmptyRow,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  ReorderableHandle as TableDragHandle,
}

export type { ReorderingOptions }
