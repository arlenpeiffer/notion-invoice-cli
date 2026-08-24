# notion-invoice-cli

Reads an invoice from Notion, resolves its hour entries, and renders a typeset PDF.

**Strictly read-only.** The tool only ever calls `search`, `pages.retrieve`,
`dataSources.retrieve`, and `dataSources.query`. Notion remains the system of record.

## Setup

1. Create an internal integration at <https://www.notion.so/my-integrations> and put
   the secret in `.env` as `NOTION_ACCESS_TOKEN`.
2. Connect it to the Invoices, Hours, Clients, and Projects databases
   (each database's `•••` → Connections). Without this they return 404.
3. `pnpm install`
4. `pnpm discover` — prints every reachable data source and writes `out/schema.json`.
   Copy the four data source ids into `.env`.
5. `cp issuer.example.json issuer.json` and fill in your details.

## Usage

```bash
pnpm invoice              # pick from a list, render a PDF
pnpm invoice 008          # skip the picker
pnpm invoice 008 --force  # render even if totals disagree with Notion
```

Output lands in `out/`, named like `Arlen Peiffer - Invoice 008 - 2025-07-29.pdf`.
The name is built in `filename()` in `src/cli.ts`.

## How it works

`discover` → `mapping.ts` → fetch → `Invoice` → HTML → PDF.

- **`src/mapping.ts`** — Notion property names. If a property is renamed in Notion,
  fix it here.
- **`src/render/invoice.css`** — layout and styling, including page size and margins.
- **`src/render/template.ts`** — the HTML structure.
- **`src/utils.ts`** — date, currency, and hours formatting.

### Things that are easy to get wrong, and how they're handled

- **`search` does not index inline databases.** Three of the four databases here are
  inline, and Hours never appeared in search results. `discover` therefore also walks
  `relation` properties, which carry the target's `data_source_id`, to reach anything
  search missed.
- **Relations are capped at 25 entries.** Line items are fetched by querying Hours
  filtered on its `Invoice` relation, not by reading the invoice's `Hours` array, so
  invoices longer than 25 entries are unaffected. Results are cursor-paginated.
- **`Rate` is a `select`, not a number.** Its option labels are amounts (`"120.00"`),
  so `readNumber` parses selects that look numeric — the same thing Notion's own
  `Total` formula does with `toNumber()`.
- **Date-only values shift a day.** `new Date('2026-08-04')` is UTC midnight, which
  formats as Aug 3 west of Greenwich. Every date is formatted with `timeZone: 'UTC'`.
- **Totals are reconciled.** The summed line items are compared against Notion's
  rollups before rendering. A mismatch stops the run, as does a missing or empty
  rollup — a check that cannot run is not a check that passed. `--force` overrides.
- **Client/project names cost two requests, not two per row.** Both databases are
  queried once into `Map<pageId, …>` and reused.

## Notes

- The Notion SDK retries 429s itself, honoring `retry-after`; no hand-rolled backoff.
- `puppeteer-core` drives your installed Chrome via `channel: 'chrome'`, so there is
  no ~200MB Chromium download.
- `.env`, `issuer.json`, and `out/` are gitignored.
