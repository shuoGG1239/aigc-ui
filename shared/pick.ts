export function randomOne<T>(inputs: T[]): T | undefined {
  if (!inputs.length) return undefined
  if (inputs.length === 1) return inputs[0]
  return inputs[Math.floor(Math.random() * inputs.length)]
}

/**
 * Sample `count` items without replacement; refill the bag when exhausted
 * so extras may repeat only after all unique picks are used.
 */
export function sampleWithoutReplacement<T>(items: T[], count: number): T[] {
  if (!items.length || count <= 0) return []
  const out: T[] = []
  let bag = items.slice()
  while (out.length < count) {
    if (!bag.length) bag = items.slice()
    const i = Math.floor(Math.random() * bag.length)
    out.push(bag[i]!)
    bag.splice(i, 1)
  }
  return out
}

/** Weighted pick; returns index, or -1 if no positive weight. */
export function pickWeightedIndex(weights: number[]): number {
  let sum = 0
  for (const w of weights) {
    if (w > 0) sum += w
  }
  if (sum <= 0) return -1
  let r = Math.random() * sum
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!
    if (w <= 0) continue
    r -= w
    if (r < 0) return i
  }
  for (let i = weights.length - 1; i >= 0; i--) {
    if (weights[i]! > 0) return i
  }
  return -1
}

/**
 * Weighted sample without replacement; refill when the bag is empty.
 */
export function sampleWeightedWithoutReplacement<T>(
  items: T[],
  count: number,
  weightOf: (item: T) => number,
): T[] {
  if (!items.length || count <= 0) return []
  const out: T[] = []
  let bag = items.slice()
  while (out.length < count) {
    if (!bag.length) bag = items.slice()
    const idx = pickWeightedIndex(bag.map(weightOf))
    if (idx < 0) break
    out.push(bag[idx]!)
    bag.splice(idx, 1)
  }
  return out
}
