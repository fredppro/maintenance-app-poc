import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCurrencyCode(locale: string) {
  const normalized = locale.toLowerCase()
  if (normalized.startsWith('pt')) {
    return 'EUR'
  }
  return 'USD'
}

export function getCurrencySymbol(locale: string, currency?: string) {
  const currencyCode = currency ?? getCurrencyCode(locale)
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const parts = formatter.formatToParts(0)
  return parts.find((part) => part.type === 'currency')?.value ?? currencyCode
}

export function formatCurrency(
  value: number,
  locale: string,
  currency?: string,
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency ?? getCurrencyCode(locale),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
