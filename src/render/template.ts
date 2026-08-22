import { readFile } from 'node:fs/promises'
import type { Issuer } from '../config.js'
import type { Invoice } from '../notion/invoice.js'
import { formatCurrency, formatDate, formatHours } from '../utils.js'

const CSS_PATH = new URL('invoice.css', import.meta.url)

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function renderHtml(invoice: Invoice, issuer: Issuer): Promise<string> {
  const css = await readFile(CSS_PATH, 'utf8')

  const rows = invoice.lines
    .map(
      line => `
        <tr>
          <td>${esc(formatDate(line.date))}</td>
          <td>${esc(line.project)}</td>
          <td class="num">${esc(formatHours(line.hours))}</td>
          <td class="num">${esc(formatCurrency(line.rate))}</td>
          <td class="num">${esc(formatCurrency(line.amount))}</td>
        </tr>`,
    )
    .join('')

  const lines = (items: string[]) => items.map(l => `<div>${esc(l)}</div>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(invoice.number)} — ${esc(invoice.clientName)}</title>
<style>${css}</style>
</head>
<body>
  <header class="masthead">
    <div class="wordmark">${esc(issuer.name)}</div>
    <div class="invoice-no">${esc(invoice.number)}</div>
  </header>

  <section class="meta">
    <div class="bill-to">
      <h2>Bill To</h2>
      <div class="client-name">${esc(invoice.clientName)}</div>
      ${lines(invoice.clientAddress)}
    </div>
    <dl class="terms">
      <dt>Invoice Date</dt><dd>${esc(formatDate(invoice.date))}</dd>
      <dt>Due Date</dt><dd>${esc(formatDate(invoice.dueDate))}</dd>
      ${invoice.terms ? `<dt>Terms</dt><dd>${esc(invoice.terms)}</dd>` : ''}
    </dl>
  </section>

  <table class="items">
    <thead>
      <tr>
        <th>Date</th><th>Project</th>
        <th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="totals">
    <div class="row"><span>Total Hours</span><span class="num">${esc(formatHours(invoice.totalHours))}</span></div>
    <div class="row grand"><span>Total Due</span><span class="num">${esc(formatCurrency(invoice.totalAmount))}</span></div>
  </section>

  <footer class="footer">
    ${issuer.paymentInstructions.length ? `<div class="pay"><h2>Payment</h2>${lines(issuer.paymentInstructions)}</div>` : ''}
    <div class="issuer">
      ${lines(issuer.address)}
      ${issuer.email ? `<div>${esc(issuer.email)}</div>` : ''}
      ${issuer.taxId ? `<div>${esc(issuer.taxId)}</div>` : ''}
    </div>
    ${issuer.thankYou ? `<p class="thanks">${esc(issuer.thankYou)}</p>` : ''}
  </footer>
</body>
</html>`
}
