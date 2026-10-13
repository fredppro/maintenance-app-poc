'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  label: string
  value: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value?: string
  onChange: (value: string) => void
  placeholder: string
  searchPlaceholder: string
  emptyText: string
  id?: string
  'aria-label'?: string
  className?: string
  /** Shown centered when there are no options, and as a footer row otherwise. */
  action?: { label: string; onClick: () => void }
}

/** Single-value select with type-to-filter, matching MultiSelect's Popover + Command pattern. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  id,
  'aria-label': ariaLabel,
  className,
  action,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            'w-full justify-between px-3 font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-40 p-0"
        align="start"
      >
        <Command>
          {options.length > 0 && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            {options.length > 0 && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      option.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {action && (
            <div
              className={cn(
                'border-t p-1',
                options.length === 0 &&
                  'flex flex-col items-center gap-2 border-t-0 p-4 text-center text-sm text-muted-foreground',
              )}
            >
              {options.length === 0 && <span>{emptyText}</span>}
              <Button
                type="button"
                variant={options.length === 0 ? 'outline' : 'ghost'}
                size="sm"
                className={options.length === 0 ? '' : 'w-full justify-start'}
                onClick={() => {
                  setOpen(false)
                  action.onClick()
                }}
              >
                <Plus data-icon="inline-start" />
                {action.label}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
