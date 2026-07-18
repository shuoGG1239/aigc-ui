export function resolveSeed(seed: number | null | undefined, seedOverride?: number): number {
  if (seedOverride !== undefined) return seedOverride
  if (seed !== null && seed !== undefined) return seed
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
}
