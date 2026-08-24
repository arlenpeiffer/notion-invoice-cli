import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'

const ENV_PATH = new URL('../.env', import.meta.url)
const ISSUER_PATH = new URL('../issuer.json', import.meta.url)

if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH)

/** Fails loudly and with a fix, rather than surfacing a 401 several calls later. */
function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`\nMissing ${name}.\n\nCopy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  return value
}

/** Discovery needs only the token — the database IDs are what it exists to find. */
export function token(): string {
  return required('NOTION_ACCESS_TOKEN')
}

export function dataSourceIds() {
  return {
    clients: required('CLIENTS_DATA_SOURCE_ID'),
    hours: required('HOURS_DATA_SOURCE_ID'),
    invoices: required('INVOICES_DATA_SOURCE_ID'),
    projects: required('PROJECTS_DATA_SOURCE_ID'),
  }
}

const IssuerSchema = z.object({
  name: z.string().min(1),
  address: z.array(z.string()).min(1),
  email: z.string().email(),
  phone: z.string(),
  taxId: z.string().optional(),
  paymentInstructions: z.array(z.string()).default([]),
})

export type Issuer = z.infer<typeof IssuerSchema>

export async function loadIssuer(): Promise<Issuer> {
  if (!existsSync(ISSUER_PATH)) {
    console.error('\nMissing issuer.json.\n\nCopy issuer.example.json to issuer.json and fill it in.')
    process.exit(1)
  }
  const parsed = IssuerSchema.safeParse(JSON.parse(await readFile(ISSUER_PATH, 'utf8')))
  if (!parsed.success) {
    console.error('\nissuer.json is invalid:\n')
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}
