import { Client } from '@notionhq/client'
import { token } from '../config.js'

/**
 * The SDK retries 429s and 5xxs itself, honoring the retry-after header and
 * falling back to exponential back-off. Raising maxRetries past the default of
 * 2 covers bursts against the ~3 req/sec limit.
 */
export const notion = new Client({
  auth: token(),
  retry: { maxRetries: 5 },
})

/** Collects every page of a cursor-paginated endpoint. */
export async function paginate<T>(
  fetchPage: (cursor?: string) => Promise<{ results: T[]; has_more: boolean; next_cursor: string | null }>,
): Promise<T[]> {
  const all: T[] = []
  let cursor: string | undefined
  do {
    const page = await fetchPage(cursor)
    all.push(...page.results)
    cursor = page.has_more ? page.next_cursor ?? undefined : undefined
  } while (cursor)
  return all
}
