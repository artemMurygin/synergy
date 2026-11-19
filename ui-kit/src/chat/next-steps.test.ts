import { describe, expect, it } from 'vitest'
import { CARD_STEPS, OVERVIEW_STEPS, classifyAnswer, nextStepsFor } from './next-steps'

describe('classifyAnswer', () => {
  it('takes a numbered list of two or more items for an overview', () => {
    expect(classifyAnswer('Вот подборка:\n1. МВА\n2. Executive MBA')).toBe('overview')
  })
  it('takes a heading or a source line for a card', () => {
    expect(classifyAnswer('### MBA «Маркетинг»\nочно')).toBe('card')
    expect(classifyAnswer('Цена 420 000 ₽. Источник: таблица цен')).toBe('card')
  })
  it('takes everything else for other', () => {
    expect(classifyAnswer('Здравствуйте!')).toBe('other')
    expect(classifyAnswer('1. Единственный пункт')).toBe('other')
  })
})

describe('nextStepsFor', () => {
  it('gives three steps for an overview and for a card, none otherwise', () => {
    expect(nextStepsFor('1. a\n2. b')).toBe(OVERVIEW_STEPS)
    expect(nextStepsFor('### карточка')).toBe(CARD_STEPS)
    expect(nextStepsFor('привет')).toEqual([])
    expect(OVERVIEW_STEPS).toHaveLength(3)
    expect(CARD_STEPS).toHaveLength(3)
  })
})
