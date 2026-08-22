# notion-invoice — Notion → PDF invoice generator

## Context

Hour tracking and invoice calculation already live in Notion, where the math is done
via formulas and rollups. What's missing is the last mile: turning an invoice row into
a clean PDF that can be sent to a client. Notion has no templating or PDF-export
endpoint, and its built-in page export is neither styleable nor reachable via API.

This builds a small local CLI that reads an invoice from Notion, resolves its hour
entries, and renders a typeset PDF. It is **strictly read-only** against Notion — the
tracking data is the system of record and must never be mutated by this tool.

**Location:** `~/Desktop/repos/notion-invoice/`

## Decisions locked in

| Decision | Choice |
|---|---|
| Notion access | Read-only. No writes, ever. |
| Invoice selection | Interactive picker, all invoices, newest first, status shown |
| Invoice number | Name property, formatted `Invoice №008` (U+2116) |
| Line-item columns | Date, Project, Hours, Rate, Amount |
| `notes` field | Excluded — internal reference only, never printed |
| Layout | Clean default designed from scratch |
| Issuer details | `issuer.json`, gitignored |
| Output | `out/`, gitignored |

## Prerequisites (manual, before step 1)

1. Create an internal integration at <https://www.notion.so/my-integrations>, copy the
   secret into `.env` as `NOTION_TOKEN`.
2. Connect that integration to **all four** databases — Invoices, Hours, Clients,
   Projects — via each database's `•••` → Connections. A database the integration
   can't see returns 404, not a helpful error.

## Notion API constraints (verified against current docs, not recalled)

Current API version is **`2026-03-11`**; SDK is **`@notionhq/client@^5.26.0`**.

- **`databases.query` no longer exists.** Since `2025-09-03` a database is a *container*
  holding one or more *data sources*, and the rows live on the data source. Flow:
  `databases.retrieve(db_id)` → read `data_sources[0].id` → `dataSources.query({data_source_id})`.
- `archived` was renamed **`in_trash`** across all endpoints — filter trashed rows out.
- Rate limit ~3 req/sec average.
- **Relation properties return page IDs only, capped at 25 per page object.** This is
  why we resolve names via lookup maps rather than per-row fetches (see below).

## Architecture

```
notion-invoice/
├── src/
│   ├── cli.ts              # entry: picker → fetch → render
│   ├── discover.ts          # one-off: dump DB + data-source schemas
│   ├── mapping.ts           # logical field → actual Notion property name
│   ├── config.ts            # .env + issuer.json, zod-validated
│   ├── notion/
│   │   ├── client.ts        # SDK client + 429 retry honoring Retry-After
│   │   ├── props.ts         # readProp() — unwraps typed property values
│   │   └── invoice.ts       # listInvoices(), fetchInvoice() → InvoiceModel
│   └── render/
│       ├── template.ts      # InvoiceModel → semantic HTML
│       ├── invoice.css      # print stylesheet (edit this to restyle)
│       └── pdf.ts           # puppeteer-core → page.pdf()
├── issuer.example.json      # committed
├── issuer.json              # GITIGNORED — real address, tax ID, payment details
├── .env.example             # committed
├── .env                     # GITIGNORED — NOTION_TOKEN + 4 database IDs
├── out/                     # GITIGNORED — rendered PDFs and HTML
└── README.md
```

**Dependencies** (deliberately few):
- `@notionhq/client@^5.26.0`
- `puppeteer-core` + `channel: 'chrome'` — drives the already-installed
  `/Applications/Google Chrome.app`, avoiding a ~200MB Chromium download
- `@clack/prompts` — the picker
- `zod` — config validation, so a missing field fails loudly at startup
- `tsx` — run TypeScript directly, no build step

No templating engine. `template.ts` emits HTML from a typed model with a small `esc()`
helper; layout iteration happens in `invoice.css`.

## Step 1 — Discovery (do this first, before any mapping is written)

Property names must come from ground truth, not guesses. `pnpm discover`:

1. Calls `search` filtered to `data_source` objects to list everything the integration
   can reach, printing each database's title, ID, and data-source ID.
2. For each, dumps the full property schema — name, type, and for
   select/status fields the available options.
3. Writes `out/schema.json` and prints a summary table.

Its output populates `.env` (four IDs: Invoices, Hours, Clients, Projects) and
`src/mapping.ts`, which is the single place property names are declared:

```ts
export const HOURS = {
  date:    'Date',
  hours:   'Number of Hours',   // ← exact strings confirmed from schema.json
  rate:    'Rate',
  total:   'Total in USD',
  project: 'Project',
  invoice: 'Invoice',
} as const
```

This keeps every Notion-naming assumption in one auditable file.

## Step 2 — Data fetch

**Relation-name resolution.** The client and project relations return bare page IDs.
Rather than one fetch per row, query the Clients and Projects data sources **once each**
and build `Map<pageId, name>`. Two requests total, reused for every row and every
invoice in the picker list — this is the difference between ~2 requests and ~40.

**Picker list:** query the Invoices data source sorted by invoice date descending.
Each row shows number, client (via map), total, terms, and status.

**On selection:** query the Hours data source filtered by
`{ property: 'Invoice', relation: { contains: <selected page id> } }`, sorted by date
ascending, **paginating on `start_cursor` until `has_more` is false**. Querying Hours
by relation rather than reading the Invoice's relation array is what sidesteps the
25-item cap — essential for any invoice with more than 25 entries.

**Property unwrapping** via one `readProp()` helper: `number` → `.number`,
`formula` → `.formula.number`, `rollup` → `.rollup.number`, `title`/`rich_text` →
`.map(t => t.plain_text).join('')`, `date` → `.date.start`, `select`/`status` → `.name`.

**Integrity check:** compare the summed line-item amounts against the invoice's rollup
total. On mismatch, print a warning with both figures and require `--force` to proceed.
Rollups can be stale or truncated; silently shipping a wrong total to a client is the
worst failure mode this tool has.

## Step 3 — Rendering

Layout, top to bottom:

- **Header** — issuer wordmark left, `Invoice №008` right
- **Meta** — Bill To (client name + address) left; Invoice Date, Due Date, Terms right
- **Line items** — Date | Project | Hours | Rate | Amount, numerics right-aligned with
  `font-variant-numeric: tabular-nums`
- **Totals** — Total Hours and Total Due, visually weighted
- **Footer** — payment instructions, tax ID, short thank-you

Print correctness details that are easy to get wrong:

- `thead { display: table-header-group }` so column headers repeat on page 2+
- `tr, .totals { break-inside: avoid }` so no row or the totals block splits mid-page
- Page numbers via Puppeteer's `displayHeaderFooter` + `footerTemplate`
  (`.pageNumber` / `.totalPages`) — Chrome does not support CSS `position: running()`
- `printBackground: true`, Letter, ~0.6in margins
- System font stack, so rendering needs no network fetch

**Date handling — a real bug class.** Notion date-only values look like `'2026-08-04'`.
`new Date('2026-08-04')` parses as UTC midnight, which in any negative-offset timezone
formats as **Aug 3**. Every date-only value is formatted with an explicit
`timeZone: 'UTC'` via `Intl.DateTimeFormat`.

**Filename:** regex the digits out of the title, so `Invoice №008` for Acme Co. becomes
`out/Invoice-008-Acme-Co.pdf`. The pretty `№` form is rendered on the PDF itself; since
selection is via picker, it never has to be typed.

**`--html` flag** writes the HTML instead of the PDF, for fast layout iteration in a
browser without a Puppeteer round-trip on every tweak.

## Files to create

All new. Highest-value first: `src/discover.ts` (unblocks everything),
`src/mapping.ts`, `src/notion/invoice.ts`, `src/render/template.ts` +
`invoice.css`, `src/cli.ts`.

`.gitignore` must cover `.env`, `issuer.json`, `out/`, `node_modules/` before any
real credentials or address land on disk.

## Verification

1. `pnpm discover` — confirm all four databases resolve and `out/schema.json` shows the
   expected properties. If a database is missing, the integration isn't connected to it.
2. `pnpm invoice --html` on a known invoice → open in Chrome, check every field against
   the Notion page side by side.
3. `pnpm invoice` → open the PDF; verify total hours and total due match Notion exactly,
   and that the `№` renders rather than showing a tofu box.
4. **Long-invoice test:** pick (or temporarily filter to) an invoice with 30+ entries and
   confirm the table header repeats on page 2, no row splits, and page numbers are right.
   This also exercises the >25 relation cap and cursor pagination.
5. **Date-boundary test:** confirm an entry logged on the 1st of a month renders as the
   1st, not the last day of the prior month.
6. **Read-only audit:** `grep -rn '\.create\|\.update\|\.delete\|patch' src/` should
   return nothing outside comments. This is the guarantee that matters most.

## Explicitly out of scope

Writing back to Notion (status changes, invoice numbering, PDF upload), emailing,
multi-currency, and tax/VAT lines. All are additive later; none are built now.

## Open questions to resolve before/while building

- **Rate location.** Is `Rate` a plain number on each Hours row, or a formula/rollup
  pulling from Project or Client? Changes how `readProp()` unwraps it. `discover` answers this.
- **Client address.** Is it plain text on the Invoice row, or a rollup from a Clients
  database? If plain text, the Clients lookup map may be needed only for the name.
- **Multi-line addresses.** If the address is a single text field with newlines,
  those need splitting to render as separate lines.
- **Logo.** The clean default assumes a typographic wordmark. Drop in an SVG/PNG if
  you'd rather have a mark.
