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
