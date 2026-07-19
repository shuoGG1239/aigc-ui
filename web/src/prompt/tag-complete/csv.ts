/** Yield to the UI thread (idle if available). */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 48 })
    } else {
      setTimeout(resolve, 0)
    }
  })
}

/** Lightweight CSV parser (handles quoted fields / escaped quotes). */
export function parseCsv(str: string): string[][] {
  const arr: string[][] = []
  let quote = false
  let row = 0
  let col = 0

  for (let c = 0; c < str.length; c++) {
    const cc = str[c]
    const nc = str[c + 1]
    if (!arr[row]) arr[row] = []
    if (arr[row][col] === undefined) arr[row][col] = ''

    if (cc === '"' && quote && nc === '"') {
      arr[row][col] += '"'
      c++
      continue
    }
    if (cc === '"') {
      quote = !quote
      continue
    }
    if (cc === ',' && !quote) {
      col++
      continue
    }
    if (cc === '\r' && nc === '\n' && !quote) {
      row++
      col = 0
      c++
      continue
    }
    if ((cc === '\n' || cc === '\r') && !quote) {
      row++
      col = 0
      continue
    }
    arr[row][col] += cc
  }

  return arr
}

/**
 * Parse CSV in slices so the UI can paint between chunks.
 * @param yieldEveryChars approximate chars per slice (default ~256KB)
 */
export async function parseCsvAsync(
  str: string,
  yieldEveryChars = 256 * 1024,
): Promise<string[][]> {
  const arr: string[][] = []
  let quote = false
  let row = 0
  let col = 0
  let sinceYield = 0

  for (let c = 0; c < str.length; c++) {
    const cc = str[c]
    const nc = str[c + 1]
    if (!arr[row]) arr[row] = []
    if (arr[row][col] === undefined) arr[row][col] = ''

    if (cc === '"' && quote && nc === '"') {
      arr[row][col] += '"'
      c++
      sinceYield++
      continue
    }
    if (cc === '"') {
      quote = !quote
      sinceYield++
      continue
    }
    if (cc === ',' && !quote) {
      col++
      sinceYield++
      continue
    }
    if (cc === '\r' && nc === '\n' && !quote) {
      row++
      col = 0
      c++
      sinceYield++
      if (sinceYield >= yieldEveryChars) {
        sinceYield = 0
        await yieldToMain()
      }
      continue
    }
    if ((cc === '\n' || cc === '\r') && !quote) {
      row++
      col = 0
      sinceYield++
      if (sinceYield >= yieldEveryChars) {
        sinceYield = 0
        await yieldToMain()
      }
      continue
    }
    arr[row][col] += cc
    sinceYield++
  }

  return arr
}
