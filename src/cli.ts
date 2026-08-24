import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { cancel, intro, isCancel, outro, select, spinner } from '@clack/prompts'
import { loadIssuer, type Issuer } from './config.js'
import { INVOICE } from './mapping.js'
import { fetchInvoice, listInvoices, type Invoice } from './notion/invoice.js'
import { renderPdf } from './render/pdf.js'
import { renderHtml } from './render/template.js'
import { formatCurrency, formatDate, formatHours } from './utils.js'

const OUT_DIR = new URL('../out/', import.meta.url)

const args = process.argv.slice(2)
const force = args.includes('--force')
const invoiceNumber = args.find(arg => !arg.startsWith('--'))

/**
 * The rollup is what Notion shows and the summed lines are what gets printed.
* A silent disagreement between them would ship a wrong total to a client, so
 * it stops the run instead.
 */
function checkTotals(invoice: Invoice): boolean {
  const issues: string[] = []

  const compare = (
    label: string,
    column: string,
    ours: number,
    notion: number | null,
    format: (n: number) => string,
  ) => {
    if (notion === null) {
      issues.push(`  ${label.padEnd(6)}  "${column}" is empty or missing — nothing to compare (lines total ${format(ours)})`)
    } else if (Math.abs(ours - notion) > 0.005) {
      issues.push(`  ${label.padEnd(6)}  lines ${format(ours)}  vs  Notion rollup ${format(notion)}`)
    }
  }

  compare('amount', INVOICE.totalAmount, invoice.totalAmount, invoice.rollupAmount, formatCurrency)
  compare('hours', INVOICE.totalHours, invoice.totalHours, invoice.rollupHours, formatHours)

  if (issues.length === 0) return true

  console.error(`\n⚠  Totals could not be confirmed against Notion:\n${issues.join('\n')}\n`)
  console.error(
    force
      ? '   Proceeding anyway (--force).\n'
      : '   Refusing to render. Re-run with --force if the line items are correct.\n',
  )
  return force
}

function filename(invoice: Invoice): string {
  const invoiceDate = invoice.date
  const invoiceNumber = invoice.number.match(/\d+/)?.[0] ?? '0'
  return `Arlen Peiffer - Invoice ${invoiceNumber} - ${invoiceDate}`
}

async function main() {
  intro('howdy')

  const load = spinner()
  load.start('Loading invoices from Notion')
  const [invoices, issuer] = await Promise.all([listInvoices(), loadIssuer()])
  load.stop(`${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'} loaded`)

  if (invoices.length === 0) {
    cancel('see ya')
    process.exit(1)
  }

  if (invoiceNumber) {
    const digits = invoiceNumber.replace(/\D/g, '')
    const match = invoices.find(i => (i.number.match(/\d+/)?.[0] ?? '').replace(/^0+/, '') === digits.replace(/^0+/, ''))
    if (!match) {
      cancel(`No invoice found matching "${invoiceNumber}"`)
      process.exit(1)
    }
    return buildInvoice(match.pageId, issuer)
  }

  const invoice = await select({
    message: 'Select an invoice',
    options: invoices.map(i => ({
      value: i.pageId,
      label: `${i.number}  ${i.clientName}`,
      hint: `${formatDate(i.date)} · ${formatCurrency(i.rollupAmount)} · ${i.status}`,
    })),
  })

  if (isCancel(invoice)) {
    cancel('see ya')
    process.exit(0)
  }

  return buildInvoice(invoice as string, issuer)
}

async function buildInvoice(pageId: string, issuer: Issuer) {
  const load = spinner()
  load.start('Loading line items')
  const invoice = await fetchInvoice(pageId)
  load.stop(`${invoice.lines.length} line items · ${invoice.totalHours} hours`)

  if (!checkTotals(invoice)) process.exit(1)

  const html = await renderHtml(invoice, issuer)
  await mkdir(OUT_DIR, { recursive: true })

  const target = new URL(`${filename(invoice)}.pdf`, OUT_DIR)
  const path = fileURLToPath(target)

  const render = spinner()
  render.start('Rendering PDF')
  await renderPdf(html, path)
  render.stop('All done ✅')

  outro('File saved @ ' + path.replace(process.cwd() + '/', ''))
}

main().catch(err => {
  console.error(`\n${err?.message ?? err}`)
  process.exit(1)
})
