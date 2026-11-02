/** The queries something reads back from the cache: whole keys, and endpoints whose `[endpoint, id]` queries are. */
export type PersistedQueries = {
    keys: ReadonlySet<string>
    perIdEndpoints: ReadonlySet<string>
}

/**
 * Only what is read back is written. Each write stringifies the response and
 * stores it synchronously, which for every query (most never read again)
 * cost the TV a pause on every refetch and filled webOS' small localStorage.
 */
export function shouldPersistQuery(
    options: { gcTime?: number },
    queryKey: readonly unknown[],
    persisted: PersistedQueries,
): boolean {
    if (options.gcTime === 0) return false
    if (queryKey.length === 2 && typeof queryKey[0] === "string" && persisted.perIdEndpoints.has(queryKey[0])) return true
    return persisted.keys.has(JSON.stringify(queryKey))
}
