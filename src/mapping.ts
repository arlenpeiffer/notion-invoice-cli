/**
 * Every Notion property-name assumption lives here, confirmed against
 * out/schema.json. If a rename in Notion breaks the tool, this is the only
 * file that should need editing.
 */

export const INVOICE = {
  name: 'Name', // title — e.g. "Invoice №008"
  date: 'Invoice Date', // date
  dueDate: 'Due Date', // formula → date
  terms: 'Terms', // select — Net 15 | Net 30
  status: 'Status', // status — New | Billed | Partially Paid | Paid
  client: 'Client', // relation → Clients
  totalHours: 'Total Hours', // rollup sum of Hours.Hours
  totalAmount: 'Total Amount', // rollup sum of Hours.Total
} as const

export const HOURS = {
  date: 'Date', // date
  hours: 'Hours', // number
  rate: 'Rate', // select — the option LABEL is the amount, e.g. "120.00"
  total: 'Total', // formula → Hours * toNumber(Rate)
  project: 'Project', // relation → Projects
  invoice: 'Invoice', // relation → Invoices
} as const

export const CLIENT = {
  name: 'Name', // title
  address: 'Address', // rich_text, may contain newlines
} as const

export const PROJECT = {
  name: 'Name', // title
} as const
