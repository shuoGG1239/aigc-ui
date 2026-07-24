import { describe, expect, it } from 'vitest'
import {
  applyPreviewPathMoves,
  collectParamHistoryPreviewPaths,
  type ParamHistoryEntry,
} from './param-history'
import { createDefaultForm } from '@shared/txt2img-form'

function entry(previewPaths?: string[]): ParamHistoryEntry {
  return {
    fingerprint: 'fp',
    at: 1,
    form: createDefaultForm('anima'),
    previewPaths,
  }
}

describe('collectParamHistoryPreviewPaths', () => {
  it('dedupes across entries', () => {
    const paths = collectParamHistoryPreviewPaths([
      entry(['C:\\a\\1.png', 'C:\\a\\2.png']),
      entry(['C:\\a\\1.png', 'C:\\b\\3.png']),
    ])
    expect(paths).toEqual(['C:\\a\\1.png', 'C:\\a\\2.png', 'C:\\b\\3.png'])
  })
})

describe('applyPreviewPathMoves', () => {
  it('rewrites moved paths and dedupes', () => {
    const { entries, fixed } = applyPreviewPathMoves(
      [
        entry(['C:\\old\\1.png', 'C:\\old\\2.png', 'C:\\keep\\3.png']),
        entry(['C:\\old\\1.png']),
      ],
      {
        'C:\\old\\1.png': 'D:\\new\\1.png',
        'C:\\old\\2.png': 'D:\\new\\1.png',
      },
    )
    expect(fixed).toBe(3)
    expect(entries[0]!.previewPaths).toEqual(['D:\\new\\1.png', 'C:\\keep\\3.png'])
    expect(entries[1]!.previewPaths).toEqual(['D:\\new\\1.png'])
  })

  it('no-ops when moved map empty', () => {
    const before = [entry(['C:\\a\\1.png'])]
    const { entries, fixed } = applyPreviewPathMoves(before, {})
    expect(fixed).toBe(0)
    expect(entries).toBe(before)
  })
})
