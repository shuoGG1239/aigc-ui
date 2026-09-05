import { describe, expect, it } from 'vitest'
import { formatAnimaPrompt, formatSdxlPrompt } from './prompt-format'

describe('prompt-format lora tags', () => {
  it('preserves lora name and strength list on anima format', () => {
    const raw = '<lora:moria_luluka:0.8, 0.85, 0.9, 0.95, 1>'
    expect(formatAnimaPrompt(raw)).toBe(raw)
  })

  it('preserves lora tag among other tags', () => {
    const raw = '1girl, <lora:moria_luluka:0.8, 0.85, 0.9>, blue eyes'
    expect(formatAnimaPrompt(raw)).toBe('1girl, <lora:moria_luluka:0.8, 0.85, 0.9>, blue eyes')
  })

  it('preserves lora tag on sdxl format', () => {
    const raw = '<lora:moria_luluka:0.8, 0.85, 0.9, 0.95, 1>'
    expect(formatSdxlPrompt(raw)).toBe(raw)
  })
})
