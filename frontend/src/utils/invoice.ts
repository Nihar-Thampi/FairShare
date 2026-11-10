import type { Bill, BillSummary } from '../types'

export type PaymentState = 'paid' | 'overdue' | 'unpaid'

export const PAYMENT_STATE_COLORS: Record<PaymentState, string> = {
  paid: 'green.8',
  overdue: 'red.8',
  unpaid: 'orange.9',
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  paid: 'Paid',
  overdue: 'Overdue',
  unpaid: 'Unpaid',
}

export const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'ZAR', 'JPY']

export const CATEGORY_OPTIONS = [
  'Food & dining', 'Groceries', 'Travel', 'Utilities', 'Rent', 'Software & subscriptions',
  'Office supplies', 'Equipment', 'Professional services', 'Marketing', 'Other',
]

/** Today as YYYY-MM-DD in the user's local time zone. */
export const todayIso = () => new Date().toLocaleDateString('en-CA')

export function paymentState(bill: Pick<Bill, 'payment_status' | 'due_date'>): PaymentState {
  if (bill.payment_status === 'paid') return 'paid'
  if (bill.due_date && bill.due_date < todayIso()) return 'overdue'
  return 'unpaid'
}

export function formatMoney(amount: number, currency?: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
    } catch {
      // Unknown currency code: fall through to a plain number with the code appended
      return `${formatNumber(amount)} ${currency}`
    }
  }
  return formatNumber(amount)
}

/** The symbol for a currency code (e.g. "₹" for INR), for input prefixes. */
export function currencySymbol(currency?: string | null): string | undefined {
  if (!currency) return undefined
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .formatToParts(0).find(p => p.type === 'currency')?.value
  } catch {
    return undefined
  }
}

const formatNumber = (amount: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)

/** Format a YYYY-MM-DD date without shifting it across time zones. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

/**
 * Sum an amount across invoices, keeping currencies apart, e.g. "₹12,400.00 · $85.00".
 * Amounts in different currencies are never added together.
 */
export function sumByCurrency(bills: BillSummary[], amount: (b: BillSummary) => number): string {
  const totals = new Map<string, number>()
  for (const b of bills) {
    const key = b.currency ?? ''
    totals.set(key, (totals.get(key) ?? 0) + amount(b))
  }
  // Drop zero groups, e.g. a not-yet-scanned invoice with no currency, unless nothing else is left
  const nonZero = [...totals.entries()].filter(([, total]) => Math.abs(total) >= 0.005)
  if (nonZero.length === 0) {
    const [only] = totals.keys()
    return formatMoney(0, only || null)
  }
  return nonZero
    .sort((a, b) => b[1] - a[1])
    .map(([currency, total]) => formatMoney(total, currency || null))
    .join(' · ')
}

/** Difference between the printed total and the sum of extracted line items, or null if unknown. */
export function totalMismatch(extractedTotal: number | null, itemsTotal: number): number | null {
  if (extractedTotal == null) return null
  const diff = Math.round((itemsTotal - extractedTotal) * 100) / 100
  return Math.abs(diff) < 0.01 ? 0 : diff
}

// Values from scanned invoices are untrusted. A leading = + - @ would make
// spreadsheet apps evaluate the cell as a formula, so those cells are prefixed with '.
function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function invoicesToCsv(bills: BillSummary[]): string {
  const header = [
    'Invoice', 'Vendor', 'Invoice number', 'Invoice date', 'Due date', 'Category', 'Currency',
    'Subtotal', 'Tax', 'Total', 'Printed total', 'Status', 'Paid on',
  ]
  const round2 = (n: number) => Math.round(n * 100) / 100
  const rows = bills.map(b => [
    b.name, b.vendor_name, b.invoice_number, b.invoice_date, b.due_date, b.category, b.currency,
    round2(b.total - b.tax_total), round2(b.tax_total), round2(b.total),
    b.extracted_total, PAYMENT_STATE_LABELS[paymentState(b)], b.paid_at,
  ])
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadTextFile(filename: string, contents: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
