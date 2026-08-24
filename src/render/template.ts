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
          <td class="numeric">${esc(formatHours(line.hours))}</td>
          <td class="numeric">${esc(formatCurrency(line.rate))}</td>
          <td class="numeric">${esc(formatCurrency(line.amount))}</td>
        </tr>
      `,
    )
    .join('')

  const address = (parts: string[]) => parts.map(part => `<div>${esc(part)}</div>`).join('')

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${esc(invoice.number)} — ${esc(invoice.clientName)}</title>
        <style>${css}</style>
      </head>

      <body>
        <header>
          <div class="heading">${esc(issuer.name)}</div>
          <div class="subheading">${esc(invoice.number)}</div>
        </header>

        <main>
          <dl class="meta">
            <div class="bill-to">
              <dt class="label">Bill To</dt>
              <dd>
                <div class="client-name">${esc(invoice.clientName)}</div>
                ${address(invoice.clientAddress)}
              </dd>
            </div>
            <div>
              <dt class="label">Invoice Date</dt>
              <dd>${esc(formatDate(invoice.date))}</dd>
            </div>
            <div>
              <dt class="label">Terms</dt>
              <dd>${esc(invoice.terms)}</dd>
            </div>
            <div>
              <dt class="label">Due Date</dt>
              <dd>${esc(formatDate(invoice.dueDate))}</dd>
            </div>
          </dl>

          <table>
            <colgroup>
              <col>
              <col class="wide">
              <col>
              <col>
              <col>
            </colgroup>
            <thead>
              <tr>
                <th class="label">Date</th>
                <th class="label">Project</th>
                <th class="label numeric">Hours</th>
                <th class="label numeric">Rate</th>
                <th class="label numeric">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <section class="totals">
            <div class="row">
              <span>Total Hours</span>
              <span>${esc(formatHours(invoice.totalHours))}</span>
            </div>
            <div class="row grand">
              <span>Total Due</span>
              <span>${esc(formatCurrency(invoice.totalAmount))}</span>
            </div>
          </section>
        </main>

        <footer>
          <div class="subheading">Thank you!</div>
          <div>
            <div>${esc(issuer.name)}</div>
            <div>${esc(issuer.email)}</div>
            <div>${esc(issuer.phone)}</div>
          </div>
          <div>
            ${address(issuer.address)}
          </div>
        </footer>
      </body>
    </html>
  `
}
