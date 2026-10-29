/** Shared pure serialization: attachment/destination order matters; object property order does not. */
export function canonicalPublicationPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPublicationPayload);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => [key, canonicalPublicationPayload(item)]));
  return value;
}
