import { describe, expect, it } from 'vitest'
import { splitChoiceList } from '@shared/prompt-syntax'
import type { PromptPool } from '@shared/prompt-pool-types'
import { expandPromptTemplate, parsePlaceholderBody } from './prompt-template'

function collectOutcomes(
  template: string,
  n: number,
  resolve: (name: string) => PromptPool | null = () => null,
): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < n; i++) {
    out.add(expandPromptTemplate(template, 'anima', resolve).prompt)
  }
  return out
}

function expectSubset(actual: Set<string>, allowed: string[]): void {
  const bad = [...actual].filter((x) => !allowed.includes(x))
  expect(bad, `unexpected outcomes: ${JSON.stringify([...actual])}`).toEqual([])
  expect(actual.size).toBeGreaterThan(0)
}

const resolveOutfit = (name: string): PromptPool | null => {
  if (name !== 'outfit') return null
  return {
    name: 'outfit',
    updatedAt: 0,
    entries: [{ prompt: 'school uniform', weight: 1 }],
  }
}

describe('splitChoiceList', () => {
  it('uses comma when there is no top-level pipe', () => {
    expect(splitChoiceList('a,b,c')).toEqual(['a', 'b', 'c'])
    expect(splitChoiceList('1girl, smile')).toEqual(['1girl', 'smile'])
    expect(splitChoiceList('a，b')).toEqual(['a', 'b'])
  })

  it('uses pipe when present at top level', () => {
    expect(splitChoiceList('a|b|c')).toEqual(['a', 'b', 'c'])
    expect(splitChoiceList('a,b|c')).toEqual(['a,b', 'c'])
    expect(splitChoiceList('a｜b')).toEqual(['a', 'b'])
  })

  it('ignores pipes inside nested tags; commas still split outside', () => {
    expect(splitChoiceList('a,b|<random:d|e>')).toEqual(['a,b', '<random:d|e>'])
    expect(splitChoiceList('a,b,<random:d|e>')).toEqual(['a', 'b', '<random:d|e>'])
    expect(splitChoiceList('1girl|<pool:outfit>, smile')).toEqual([
      '1girl',
      '<pool:outfit>, smile',
    ])
  })

  it('respects backticks and keeps empty branches', () => {
    expect(splitChoiceList('`a, b`,c')).toEqual(['`a, b`', 'c'])
    expect(splitChoiceList('a|')).toEqual(['a', ''])
    expect(splitChoiceList('a,')).toEqual(['a', ''])
  })
})

describe('parsePlaceholderBody', () => {
  it('keeps choice name intact; trailing : is counts/strengths', () => {
    expect(parsePlaceholderBody('a,b:2')).toEqual({ name: 'a,b', counts: [2] })
    expect(parsePlaceholderBody('a,b|c:0.8')).toEqual({
      name: 'a,b|c',
      counts: [1],
      strengths: [0.8],
    })
  })
})

describe('expandPromptTemplate <random:>', () => {
  it('treats comma-only like pipe branches', () => {
    const set = collectOutcomes('<random:a,b,c>', 80)
    expectSubset(set, ['a', 'b', 'c'])
    expect(set.size).toBe(3)
  })

  it('keeps pipe-only behavior', () => {
    const set = collectOutcomes('<random:a|b|c>', 80)
    expectSubset(set, ['a', 'b', 'c'])
  })

  it('lets pipe win over commas (pretty adds spaces)', () => {
    const set = collectOutcomes('<random:a,b|c>', 80)
    expectSubset(set, ['a, b', 'c'])
    expect(set.size).toBe(2)
  })

  it('expands nested random after outer comma split', () => {
    const set = collectOutcomes('<random:a,b,<random:d|e>>', 120)
    expectSubset(set, ['a', 'b', 'd', 'e'])
    expect(set.size).toBe(4)
  })

  it('handles backticks, empty branch, count, and pool compounds', () => {
    expectSubset(collectOutcomes('<random:`a, b`,c>', 60), ['a, b', 'c'])

    const empty = collectOutcomes('<random:a|>', 60)
    expect(empty.has('a')).toBe(true)
    expect(empty.has('')).toBe(true)

    expectSubset(collectOutcomes('<random:a,b:2>', 40), ['a, b', 'b, a'])

    expectSubset(collectOutcomes('<random:1girl|<pool:outfit>, smile>', 40, resolveOutfit), [
      '1girl',
      'school uniform, smile',
    ])
  })

  it('leaves unknown pool and reports missing', () => {
    const { prompt, missing } = expandPromptTemplate('<random:<pool:nope>>', 'anima', () => null)
    expect(prompt).toBe('<pool:nope>')
    expect(missing).toEqual(['nope'])
  })
})

describe('expandPromptTemplate <shuffle:>', () => {
  it('shuffles comma segments', () => {
    const orders = collectOutcomes('<shuffle:a,b,c>', 60)
    const allowed = [
      'a, b, c',
      'a, c, b',
      'b, a, c',
      'b, c, a',
      'c, a, b',
      'c, b, a',
    ]
    expectSubset(orders, allowed)
    expect(orders.size).toBeGreaterThanOrEqual(3)
    for (const o of orders) {
      expect(o.split(', ').sort()).toEqual(['a', 'b', 'c'])
    }
  })

  it('keeps comma inside pipe branch as one atom', () => {
    const orders = collectOutcomes('<shuffle:a,b|c>', 40)
    for (const o of orders) {
      expect(['a,b, c', 'c, a,b']).toContain(o)
    }
  })

  it('expands pool inside a shuffle segment before shuffle', () => {
    const orders = collectOutcomes('<shuffle:x|<pool:outfit>, smile>', 30, resolveOutfit)
    for (const o of orders) {
      expect(['x, school uniform, smile', 'school uniform, smile, x']).toContain(o)
    }
  })
})
