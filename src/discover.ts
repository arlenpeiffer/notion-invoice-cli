import { mkdir, writeFile } from 'node:fs/promises'
import type { RichTextItemResponse } from '@notionhq/client'
import { notion, paginate } from './notion/client.js'

const OUT_DIR = new URL('../out/', import.meta.url)
const SCHEMA_PATH = new URL('schema.json', OUT_DIR)

const plain = (rich: RichTextItemResponse[]) => rich.map(t => t.plain_text).join('') || '(untitled)'

/** The option labels a select/status/relation exposes, for eyeballing against mapping.ts. */
function detail(config: any): string {
  switch (config.type) {
    case 'select':
    case 'multi_select':
      return config[config.type].options.map((o: any) => o.name).join(', ')
    case 'status':
      return config.status.options.map((o: any) => o.name).join(', ')
    case 'formula':
      return config.formula.expression ?? ''
    case 'rollup': {
      const r = config.rollup
      return `${r.function} of ${r.rollup_property_name} via ${r.relation_property_name}`
    }
    case 'relation':
      return `→ data source ${config.relation.data_source_id}`
    default:
      return ''
    }
}

async function main() {
  const sources = await paginate(cursor =>
    notion.search({
      filter: { property: 'object', value: 'data_source', in_trash: false },
      start_cursor: cursor,
      page_size: 100,
    }) as Promise<any>,
  )

  const found = new Map<string, any>()
  for (const s of sources as any[]) {
    if (s.object === 'data_source' && !s.in_trash) found.set(s.id, s)
  }

  /**
   * `search` does not index inline databases, so a database embedded in a page
   * is invisible to it even when the integration can read it. Relation configs
   * carry the data source id of their target, so walking those edges reaches
   * anything search missed. Repeats until closure, since a data source found
   * this way may itself relate to another.
   */
  for (let pass = 0; pass < 5; pass++) {
    const targets = new Set<string>()
    for (const source of found.values()) {
      if (!source) continue
      for (const p of Object.values<any>(source.properties ?? {})) {
        const id = p.type === 'relation' ? p.relation?.data_source_id : undefined
        if (id && !found.has(id)) targets.add(id)
      }
    }
    if (targets.size === 0) break
    for (const id of targets) {
      try {
        const ds: any = await notion.dataSources.retrieve({ data_source_id: id })
        if (!ds.in_trash) found.set(ds.id, ds)
      } catch {
        // Related data source the integration cannot read; not necessarily needed.
        found.set(id, null)
      }
    }
  }

  const visible = [...found.values()].filter(Boolean)

  if (visible.length === 0) {
    console.error(
      '\nThe integration cannot see any data sources.\n\n' +
        'Open each database in Notion → ••• → Connections → add your integration.',
    )
    process.exit(1)
  }

  const schema = visible.map(source => ({
    title: plain(source.title),
    inline: source.is_inline === true,
    dataSourceId: source.id,
    databaseId: source.database_parent?.database_id ?? source.parent?.database_id ?? null,
    properties: Object.values(source.properties ?? {}).map((p: any) => ({
      name: p.name,
      type: p.type,
      detail: detail(p),
    })),
  }))

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(SCHEMA_PATH, JSON.stringify(schema, null, 2))

  for (const db of schema) {
    console.log(`\n\x1b[1m${db.title}\x1b[0m${db.inline ? ' \x1b[2m(inline)\x1b[0m' : ''}`)
    console.log(`  database id     ${db.databaseId ?? '(unknown)'}`)
    console.log(`  data source id  ${db.dataSourceId}`)
    for (const p of db.properties) {
      const label = `${p.name} \x1b[2m(${p.type})\x1b[0m`
      console.log(`    ${label}${p.detail ? `\x1b[2m  ${p.detail}\x1b[0m` : ''}`)
    }
  }

  console.log(
    `\n${schema.length} data source(s) written to out/schema.json.\n` +
      'Copy the data source ids above into .env, then confirm property names in src/mapping.ts.',
  )
}

main().catch(err => {
  console.error(`\nDiscovery failed: ${err.message ?? err}`)
  process.exit(1)
})
