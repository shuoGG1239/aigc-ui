/** Shared numeric clamps for txt2img form / generate IPC. */

export const BATCH_SIZE_MIN = 1
export const BATCH_SIZE_MAX = 64

export const CLIP_SKIP_MIN = 1
export const CLIP_SKIP_MAX = 12

/** Latent size wheel / step (Comfy-friendly multiple). */
export const LATENT_SIZE_STEP = 64
export const LATENT_SIZE_MIN = 64
export const LATENT_SIZE_MAX = 2048

export function clampBatchSize(value: unknown, fallback = BATCH_SIZE_MIN): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(BATCH_SIZE_MAX, Math.max(BATCH_SIZE_MIN, n))
}

export function clampClipSkip(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(CLIP_SKIP_MAX, Math.max(CLIP_SKIP_MIN, n))
}
