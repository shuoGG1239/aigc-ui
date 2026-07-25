import { describe, expect, it } from 'vitest'
import { getCaretToken, searchPoolCompletions } from './token'

describe('getCaretToken', () => {
  it('completes tags inside <random:> segments', () => {
    const text = '<random:1girl, sm'
    const tok = getCaretToken(text, text.length)
    expect(tok).toEqual({ mode: 'tag', start: 15, end: text.length, query: 'sm' })
  })

  it('completes after pipe branches', () => {
    const text = '<random:a|loo'
    const tok = getCaretToken(text, text.length)
    expect(tok).toEqual({ mode: 'tag', start: 10, end: text.length, query: 'loo' })
  })

  it('completes inside <shuffle:>', () => {
    const text = '<shuffle:smile, look'
    const tok = getCaretToken(text, text.length)
    expect(tok).toEqual({ mode: 'tag', start: 16, end: text.length, query: 'look' })
  })

  it('still offers syntax before colon', () => {
    expect(getCaretToken('<ran', 4)).toMatchObject({ mode: 'syntax', query: 'ran' })
  })

  it('keeps lora mode', () => {
    expect(getCaretToken('<lora:foo', 9)).toMatchObject({ mode: 'lora', query: 'foo' })
  })

  it('completes pool names after <pool:', () => {
    expect(getCaretToken('<pool:cha', 9)).toEqual({
      mode: 'pool',
      start: 0,
      end: 9,
      query: 'cha',
    })
  })

  it('offers all pools when query is empty', () => {
    expect(getCaretToken('<pool:', 6)).toMatchObject({ mode: 'pool', query: '' })
  })

  it('stops pool complete once counts colon is typed', () => {
    expect(getCaretToken('<pool:chara:2', 13)).toBeNull()
  })

  it('filters pool names by query', () => {
    const hits = searchPoolCompletions(['outfit', 'chara', 'quality'], 'cha')
    expect(hits.map((h) => h.key)).toEqual(['chara'])
    expect(hits[0]?.insert).toBe('<pool:chara>')
  })

  it('completes normal prompt tags', () => {
    const text = '1girl, sm'
    expect(getCaretToken(text, text.length)).toEqual({
      mode: 'tag',
      start: 7,
      end: text.length,
      query: 'sm',
    })
  })
})
