/**
 * Whether a form differs from the state it was loaded (or last saved)
 * with — what the `SaveBar` reads to decide between "Unsaved changes" and
 * a disabled Save.
 *
 * Structural, by JSON: every portal form's state is plain strings,
 * numbers, booleans and arrays of those, built by a `toForm()` from the
 * server row, so two states built the same way serialise identically
 * when they are equal. Either side undefined (still loading) reads as
 * clean, never as dirty — a bar saying "unsaved changes" over a form that
 * has not arrived is the wrong first impression.
 */
export function isDirty<T>(initial: T | undefined, current: T | undefined): boolean {
  if (initial === undefined || current === undefined) return false;
  if (initial === current) return false;
  return JSON.stringify(initial) !== JSON.stringify(current);
}
