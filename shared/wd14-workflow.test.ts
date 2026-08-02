import { describe, expect, it } from 'vitest'
import { ComfyClass } from './comfy-class'
import { buildWd14Workflow, extractWd14Tags } from './wd14-workflow'

describe('wd14-workflow', () => {
  it('builds LoadImage → WD14 workflow', () => {
    const wf = buildWd14Workflow('test.png', {
      model: 'wd-swinv2-tagger-v3',
      threshold: 0.35,
      characterThreshold: 0.85,
      replaceUnderscore: true,
      trailingComma: false,
      excludeTags: '',
    })
    expect((wf['1'] as { class_type: string }).class_type).toBe(ComfyClass.LoadImage)
    expect((wf['2'] as { class_type: string }).class_type).toBe(ComfyClass.WD14Tagger)
    expect((wf['2'] as { inputs: { model: string } }).inputs.model).toBe('wd-swinv2-tagger-v3')
  })

  it('extracts tags from history outputs', () => {
    expect(
      extractWd14Tags({
        outputs: { '2': { tags: ['1girl, solo, brown hair'] } },
      }),
    ).toBe('1girl, solo, brown hair')

    expect(
      extractWd14Tags({
        outputs: { '2': { text: ['a, b'] } },
      }),
    ).toBe('a, b')
  })
})
