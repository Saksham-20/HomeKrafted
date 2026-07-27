/** `"a, b,c"` -> `["a", "b", "c"]` — shared by every comma-separated multi-value filter query param. */
export function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
