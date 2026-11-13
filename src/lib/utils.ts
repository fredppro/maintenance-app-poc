import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        'control', 'control-sm', 'control-xs', 'control-lg', 'control-padding',
        'field', 'form', 'section', 'page', 'page-desktop', 'badge', 'table-row', 'table-cell',
      ],
      radius: ['control', 'control-sm', 'control-inner'],
      tracking: ['ui'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
