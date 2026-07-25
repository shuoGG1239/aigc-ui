import { describe, expect, it } from 'vitest'
import { getCaretToken } from './token'

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

  it('does not tag-complete bare <pool: prefix', () => {
    expect(getCaretToken('<pool:cha', 9)).toBeNull()
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
