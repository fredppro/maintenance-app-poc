'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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

export interface Option {
  label: string
  value: string
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  id?: string
  'aria-label'?: string
  'aria-required'?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  className?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Shown centered when there are no options, and as a footer row otherwise. */
  action?: { label: string; onClick: () => void }
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select items...',
  id,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  className,
  searchPlaceholder,
  emptyText = 'No item found.',
  action,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item))
  }

  const handleSelect = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((i) => i !== item))
    } else {
      onChange([...selected, item])
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-label={ariaLabel ?? placeholder}
            aria-required={ariaRequired}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            className="h-auto min-h-control w-full min-w-0 justify-between py-2 font-normal pointer-coarse:h-auto pointer-coarse:min-h-control-lg"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {selected.length > 0 ? (
                options
                  .filter((option) => selected.includes(option.value))
                  .map((option) => (
                    <Badge
                      key={option.value}
                      variant="secondary"
                      className="max-w-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnselect(option.value)
                      }}
                    >
                      <span className="truncate">{option.label}</span>
                      <X className="ml-1 shrink-0 hover:text-destructive" />
                    </Badge>
                  ))
              ) : (
                <span className="truncate text-muted-foreground">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-40 p-0" align="start">
          <Command>
            {options.length > 0 && (
              <CommandInput placeholder={searchPlaceholder ?? placeholder} />
            )}
            <CommandList>
              {options.length > 0 && <CommandEmpty>{emptyText}</CommandEmpty>}
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected.includes(option.value)
                          ? 'opacity-100'
                          : 'opacity-0'
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
    </div>
  )
}
