const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every id in this app is a uuid from a URL segment, and Postgres raises
 * `invalid input syntax for type uuid` on anything else — which PostgREST turns
 * into a 500. A garbage id is a "not found", not a server fault, so the lookups
 * check the shape before they ask the database.
 */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
