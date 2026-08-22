import { dataSourceIds } from '../config.js'
import { CLIENT, HOURS, INVOICE } from '../mapping.js'
import { notion, paginate } from './client.js'
import { readDate, readFirstRelationId, readNumber, readText, readTitle } from './props.js'

const ids = dataSourceIds()

export type LineItem = {
  date: string | null
  project: string
  hours: number
  rate: number | null
  amount: number
}

export type Invoice = {
  pageId: string
  number: string
  clientName: string
  clientAddress: string[]
  date: string | null
  dueDate: string | null
  status: string
  terms: string
  lines: LineItem[]
  /** Calculated from `lines`. */
  totalHours: number
  totalAmount: number
  /** Notion's rollups, for reconciliation. */
  rollupHours: number | null
  rollupAmount: number | null
}

/** What the picker needs. No line items are fetched, so no calculated totals. */
export type InvoiceSummary = Pick<
  Invoice,
  'pageId' | 'number' | 'clientName' | 'date' | 'status' | 'terms' | 'rollupAmount'
>

const props = (page: any) => page.properties ?? {}

/** Every page in a data source. One query, reused across every row and every invoice. */
async function allPages(dataSourceId: string): Promise<any[]> {
  return paginate(cursor =>
    notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    }) as Promise<any>,
  )
}

type Client = { name: string; address: string[] }
type Project = { name: string }

let clientsCache: Map<string, Client> | null = null

async function clients(): Promise<Map<string, Client>> {
  clientsCache ??= new Map(
    (await allPages(ids.clients)).map(page => [
      page.id,
      {
        name: readTitle(page),
        address: readText(props(page)[CLIENT.address])
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean),
      },
    ]),
  )
  return clientsCache
}

let projectsCache: Map<string, Project> | null = null

async function projects(): Promise<Map<string, Project>> {
  projectsCache ??= new Map(
    (await allPages(ids.projects)).map(page => [page.id, { name: readTitle(page) }]),
  )
  return projectsCache
}

const invoicesCache = new Map<string, any>()

export async function listInvoices(): Promise<InvoiceSummary[]> {
  const [pages, clientMap] = await Promise.all([
    paginate(cursor =>
      notion.dataSources.query({
        data_source_id: ids.invoices,
        sorts: [{ property: INVOICE.date, direction: 'descending' }],
        start_cursor: cursor,
        page_size: 100,
      }) as Promise<any>,
    ),
    clients(),
  ])

  return (pages as any[])
    .filter(page => !page.in_trash)
    .map(page => {
      invoicesCache.set(page.id, page)
      const p = props(page)
      const clientId = readFirstRelationId(p[INVOICE.client])
      return {
        pageId: page.id,
        number: readTitle(page) || '(untitled)',
        clientName: (clientId && clientMap.get(clientId)?.name) || '—',
        date: readDate(p[INVOICE.date]),
        status: readText(p[INVOICE.status]),
        terms: readText(p[INVOICE.terms]),
        rollupAmount: readNumber(p[INVOICE.totalAmount]),
      }
    })
}

export async function fetchInvoice(pageId: string): Promise<Invoice> {
  const page: any = invoicesCache.get(pageId) ?? (await notion.pages.retrieve({ page_id: pageId }))
  const p = props(page)

  /**
   * Queries Hours by its Invoice relation rather than reading the invoice's own
   * Hours relation array, which the API caps at 25 entries.
   */
  const [hourPages, clientMap, projectMap] = await Promise.all([
    paginate(cursor =>
      notion.dataSources.query({
        data_source_id: ids.hours,
        filter: { property: HOURS.invoice, relation: { contains: pageId } },
        sorts: [{ property: HOURS.date, direction: 'ascending' }],
        start_cursor: cursor,
        page_size: 100,
      }) as Promise<any>,
    ),
    clients(),
    projects(),
  ])

  const lines: LineItem[] = (hourPages as any[])
    .filter(row => !row.in_trash)
    .map(row => {
      const rp = props(row)
      const projectId = readFirstRelationId(rp[HOURS.project])
      const hours = readNumber(rp[HOURS.hours]) ?? 0
      const rate = readNumber(rp[HOURS.rate])
      return {
        date: readDate(rp[HOURS.date]),
        project: (projectId && projectMap.get(projectId)?.name) || '—',
        hours,
        rate,
        amount: readNumber(rp[HOURS.total]) ?? hours * (rate ?? 0),
      }
    })

  const clientId = readFirstRelationId(p[INVOICE.client])

  return {
    pageId: page.id,
    number: readTitle(page) || '(untitled)',
    clientName: (clientId && clientMap.get(clientId)?.name) || '—',
    clientAddress: (clientId && clientMap.get(clientId)?.address) || [],
    date: readDate(p[INVOICE.date]),
    dueDate: readDate(p[INVOICE.dueDate]),
    status: readText(p[INVOICE.status]),
    terms: readText(p[INVOICE.terms]),
    lines,
    totalHours: lines.reduce((sum, l) => sum + l.hours, 0),
    totalAmount: lines.reduce((sum, l) => sum + l.amount, 0),
    rollupHours: readNumber(p[INVOICE.totalHours]),
    rollupAmount: readNumber(p[INVOICE.totalAmount]),
  }
}
