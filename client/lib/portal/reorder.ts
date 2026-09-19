/**
 * The three edits an ordered list in a portal screen makes — move one
 * step, remove, append — as pure functions, so the rules a reorder screen
 * relies on are testable without rendering one (the featured list,
 * `/admin/catalog/featured`, is the first).
 *
 * Every function returns a **new array** and never mutates its input: the
 * caller hands the result straight to `setState`, and `isDirty` compares
 * by structure, so an unchanged list must still equal the baseline.
 */

/**
 * Swap the item at `index` with its neighbour, `-1` towards the front and
 * `1` towards the back.
 *
 * A move that would leave the list — the first item up, the last item
 * down, an index that is not in it — is a no-op returning an equal copy
 * rather than an error: the buttons are disabled at the ends, and a
 * double-fired click must not throw.
 */
export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const next = [...list];
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Every occurrence of `item` removed. Removing something absent is a no-op. */
export function removeItem<T>(list: readonly T[], item: T): T[] {
  return list.filter((entry) => entry !== item);
}

/**
 * `item` added at the back, unless it is already in the list or the list
 * is at `max` — in which case it is left as it was. Reporting *why* it was
 * not added is the caller's job (`canAppend` answers it), because "the
 * list is full" and "it is already there" want different sentences.
 */
export function appendItem<T>(list: readonly T[], item: T, max: number): T[] {
  return canAppend(list, item, max) === "ok" ? [...list, item] : [...list];
}

export type AppendVerdict = "ok" | "duplicate" | "full";

/** Whether `appendItem` would add `item`, and if not, which of the two reasons. */
export function canAppend<T>(list: readonly T[], item: T, max: number): AppendVerdict {
  if (list.includes(item)) return "duplicate";
  if (list.length >= max) return "full";
  return "ok";
}
