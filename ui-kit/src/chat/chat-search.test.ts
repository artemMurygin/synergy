import { describe, expect, it } from 'vitest'
import { countMatches, normalizeQuery, splitByQuery } from './chat-search'

describe('normalizeQuery', () => {
  it('trims the query; blank means no search', () => {
    expect(normalizeQuery('  рассрочка ')).toBe('рассрочка')
    expect(normalizeQuery('   ')).toBe('')
  })
})

describe('splitByQuery', () => {
  it('splits the text into plain parts and matches, ignoring the case', () => {
    expect(splitByQuery('Какая рассрочка есть? РАССРОЧКА!', 'рассрочка')).toEqual([
      { text: 'Какая ', match: false },
      { text: 'рассрочка', match: true },
      { text: ' есть? ', match: false },
      { text: 'РАССРОЧКА', match: true },
      { text: '!', match: false },
    ])
  })
  it('returns the whole text when nothing matches or the query is blank', () => {
    expect(splitByQuery('привет', 'скидка')).toEqual([{ text: 'привет', match: false }])
    expect(splitByQuery('привет', ' ')).toEqual([{ text: 'привет', match: false }])
  })
  it('takes the query literally, not as a pattern', () => {
    expect(splitByQuery('цена (от) 5.0', '(от)')).toEqual([
      { text: 'цена ', match: false },
      { text: '(от)', match: true },
      { text: ' 5.0', match: false },
    ])
  })
  it('does not overlap matches', () => {
    expect(countMatches('аааа', 'аа')).toBe(2)
  })
})

describe('countMatches', () => {
  it('counts occurrences without the case', () => {
    expect(countMatches('Рассрочка на 12 месяцев, рассрочка', 'РАССРОЧКА')).toBe(2)
    expect(countMatches('ничего', 'скидка')).toBe(0)
    expect(countMatches('ничего', '')).toBe(0)
  })
})
