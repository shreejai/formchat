/**
 * Suggestions for a location query: case-insensitive substring match, with
 * prefix matches first. An empty query, or one that already equals a
 * suggestion, returns nothing.
 */
export function filterLocalities(
  query: string,
  localities: readonly string[],
  limit = 6,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (localities.some((l) => l.toLowerCase() === q)) return [];
  const matches = localities.filter((l) => l.toLowerCase().includes(q));
  const prefix = matches.filter((l) => l.toLowerCase().startsWith(q));
  const rest = matches.filter((l) => !l.toLowerCase().startsWith(q));
  return [...prefix, ...rest].slice(0, limit);
}
