type Prop = Record<string, any> | undefined

/** Text of a title / rich_text property, with Notion's inline formatting dropped. */
export function readText(prop: Prop): string {
  if (!prop) return ''
  const rich = prop.type === 'title' ? prop.title : prop.type === 'rich_text' ? prop.rich_text : null
  if (rich) return rich.map((t: any) => t.plain_text).join('')
  if (prop.type === 'select') return prop.select?.name ?? ''
  if (prop.type === 'status') return prop.status?.name ?? ''
  if (prop.type === 'formula' && prop.formula?.type === 'string') return prop.formula.string ?? ''
  return ''
}

/**
 * A page's title, located by property type rather than by name. Every database
 * here happens to call its title "Name", but that is a coincidence worth not
 * depending on.
 */
export function readTitle(page: any): string {
  const title = Object.values<any>(page.properties ?? {}).find(p => p?.type === 'title')
  return readText(title)
}

/**
 * Numeric value of a property.
 *
 * `Rate` on Hours is a *select* whose option labels are amounts ("120.00"),
 * not a number property — so a select that parses cleanly is treated as
 * numeric. Notion's own Total formula does the same via toNumber().
 */
export function readNumber(prop: Prop): number | null {
  if (!prop) return null
  switch (prop.type) {
    case 'number':
      return prop.number ?? null
    case 'formula':
      return prop.formula?.type === 'number' ? prop.formula.number ?? null : null
    case 'rollup':
      return prop.rollup?.type === 'number' ? prop.rollup.number ?? null : null
    case 'select': {
      const parsed = Number(prop.select?.name?.replace(/[$,\s]/g, ''))
      return Number.isFinite(parsed) ? parsed : null
    }
    default:
      return null
  }
}

/** ISO date string ("2026-08-04"), never a Date — see formatDate for why. */
export function readDate(prop: Prop): string | null {
  if (!prop) return null
  if (prop.type === 'date') return prop.date?.start ?? null
  if (prop.type === 'formula' && prop.formula?.type === 'date') return prop.formula.date?.start ?? null
  return null
}

/** Related page ids. Capped at 25 by the API — never rely on this for line items. */
export function readRelationIds(prop: Prop): string[] {
  if (!prop || prop.type !== 'relation') return []
  return prop.relation.map((r: any) => r.id)
}

export function readFirstRelationId(prop: Prop): string | null {
  return readRelationIds(prop)[0] ?? null
}
