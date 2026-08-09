import { describe, expect, it } from 'vitest'
import { extractLoraTags, formatLoraTag, parseStrengthSlot } from './lora-tag'

describe('lora-tag', () => {
  it('parses single strengths', () => {
    const { loras, prompt } = extractLoraTags('<lora:foo:0.8>, 1girl', '')
    expect(prompt).toBe('1girl')
    expect(loras).toEqual([{ name: 'foo', strengthModel: 0.8, strengthClip: 0.8 }])
  })

  it('parses model/clip split', () => {
    const { loras } = extractLoraTags('<lora:foo:0.8:0.6>', '')
    expect(loras[0]).toMatchObject({ strengthModel: 0.8, strengthClip: 0.6 })
  })

  it('picks from weight list for model (clip shares same roll)', () => {
    const allowed = new Set([0.7, 0.8, 0.9, 1])
    for (let i = 0; i < 40; i++) {
      const { loras } = extractLoraTags('<lora:moria_luluka:0.7,0.8,0.9,1>', '')
      expect(loras).toHaveLength(1)
      expect(allowed.has(loras[0]!.strengthModel)).toBe(true)
      expect(loras[0]!.strengthClip).toBe(loras[0]!.strengthModel)
    }
  })

  it('picks model and clip lists independently', () => {
    const models = new Set([0.7, 0.8])
    const clips = new Set([0.5, 0.6])
    for (let i = 0; i < 40; i++) {
      const { loras } = extractLoraTags('<lora:foo:0.7,0.8:0.5,0.6>', '')
      expect(models.has(loras[0]!.strengthModel)).toBe(true)
      expect(clips.has(loras[0]!.strengthClip)).toBe(true)
    }
  })

  it('parseStrengthSlot handles empty / invalid', () => {
    expect(parseStrengthSlot(undefined, 1)).toBe(1)
    expect(parseStrengthSlot('', 1)).toBe(1)
    expect(parseStrengthSlot('abc', 1)).toBe(1)
    expect(parseStrengthSlot('0.75', 1)).toBe(0.75)
  })

  it('formats tags', () => {
    expect(formatLoraTag('a.safetensors', 1)).toBe('<lora:a:1>')
    expect(formatLoraTag('a.safetensors', 0.8, 0.6)).toBe('<lora:a:0.8:0.6>')
  })
})
