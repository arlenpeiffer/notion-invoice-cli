/** Missing values render as an em dash everywhere they appear. */
const MISSING = '—'

export function formatCurrency(amount: number | null): string {
  if (amount === null) return MISSING
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

/**
 * Notion date-only values ("2026-08-04") parse as UTC midnight, which formats
 * as the previous day in any negative-offset timezone. Formatting in UTC keeps
 * the date the one that was logged.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return MISSING
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(date.getTime())) return MISSING
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

/** Trailing zeros dropped: 7.5 reads better than 7.50, 8 better than 8.00. */
export function formatHours(count: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(count)
}
