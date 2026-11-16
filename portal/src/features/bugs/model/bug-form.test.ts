import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  BUG_DESCRIPTION_MAX_LENGTH,
  BUG_TITLE_MAX_LENGTH,
  agentsOfProduct,
  initialBugFormState,
  selectProduct,
  useBugForm,
  validateBugForm,
  type BugFormProduct
} from './bug-form'

const products: BugFormProduct[] = [
  { id: 'p1', name: 'control-center', agents: [{ id: 'a1', name: 'Ассистент' }, { id: 'a2', name: 'Старый', archivedAt: '2026-01-01T00:00:00.000Z' }, { id: 'a3', name: 'Аудитор' }] },
  { id: 'p2', name: 'Веб', agents: [{ id: 'a3', name: 'Аудитор' }, { id: 'a4', name: 'Только веб' }] },
  { id: 'p3', name: 'manager-helper', agents: [{ id: 'a5', name: 'Помощник' }] }
]

describe('agentsOfProduct', () => {
  it('returns agents of the selected product without archived ones', () => {
    expect(agentsOfProduct(products, 'p1').map((a) => a.id)).toEqual(['a1', 'a3'])
  })
  it('is empty while no product is selected or the product is unknown', () => {
    expect(agentsOfProduct(products, '')).toEqual([])
    expect(agentsOfProduct(products, 'zzz')).toEqual([])
  })
})

describe('selectProduct', () => {
  it('resets the agent when it is not in the new product', () => {
    expect(selectProduct(products, { productId: 'p1', agentId: 'a1' }, 'p2')).toEqual({ productId: 'p2', agentId: '' })
  })
  it('keeps the agent that belongs to the new product too', () => {
    expect(selectProduct(products, { productId: 'p1', agentId: 'a3' }, 'p2')).toEqual({ productId: 'p2', agentId: 'a3' })
  })
})

describe('initialBugFormState', () => {
  it('has nothing selected without an agentId', () => {
    expect(initialBugFormState(products, undefined)).toMatchObject({ productId: '', agentId: '', productOptions: products })
  })
  it('selects product and agent when the agent is in exactly one product', () => {
    expect(initialBugFormState(products, 'a1')).toMatchObject({ productId: 'p1', agentId: 'a1' })
  })
  it('offers only the agent products when there are several, agent stays selected', () => {
    const state = initialBugFormState(products, 'a3')
    expect(state.productId).toBe('')
    expect(state.agentId).toBe('a3')
    expect(state.productOptions.map((p) => p.id)).toEqual(['p1', 'p2'])
  })
  it('ignores an unknown or archived agent', () => {
    for (const id of ['nope', 'a2']) {
      expect(initialBugFormState(products, id)).toMatchObject({ productId: '', agentId: '', productOptions: products })
    }
  })
})

describe('validateBugForm', () => {
  const valid = { productId: 'p1', agentId: 'a1', title: 'Не работает', description: 'Подробно' }
  it('accepts a valid form and trims', () => {
    expect(validateBugForm({ ...valid, title: '  Не работает ' })).toEqual({ ok: true, data: valid })
  })
  it('requires every field', () => {
    const result = validateBugForm({ productId: '', agentId: '', title: '  ', description: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['agentId', 'description', 'productId', 'title'])
  })
  it('limits title to 200 and description to 4000 after trim', () => {
    expect(validateBugForm({ ...valid, title: 'а'.repeat(BUG_TITLE_MAX_LENGTH) }).ok).toBe(true)
    expect(validateBugForm({ ...valid, description: 'а'.repeat(BUG_DESCRIPTION_MAX_LENGTH) }).ok).toBe(true)
    const tooLong = validateBugForm({ ...valid, title: 'а'.repeat(201), description: 'а'.repeat(4001) })
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(Object.keys(tooLong.errors).sort()).toEqual(['description', 'title'])
  })
})

describe('useBugForm', () => {
  it('exposes agents of the selected product and resets the agent on product change', () => {
    const { result } = renderHook(() => useBugForm(products, undefined))
    expect(result.current.agents).toEqual([])
    act(() => result.current.setProduct('p1'))
    act(() => result.current.setField('agentId', 'a1'))
    expect(result.current.agents.map((a) => a.id)).toEqual(['a1', 'a3'])
    act(() => result.current.setProduct('p2'))
    expect(result.current.values.agentId).toBe('')
  })

  it('preselects by agentId', () => {
    const { result } = renderHook(() => useBugForm(products, 'a1'))
    expect(result.current.values).toMatchObject({ productId: 'p1', agentId: 'a1' })
  })

  it('submit returns the body when valid, otherwise sets errors and returns null', () => {
    const { result } = renderHook(() => useBugForm(products, 'a1'))
    let body: unknown
    act(() => { body = result.current.submit() })
    expect(body).toBeNull()
    expect(result.current.errors.title).toBeTruthy()
    act(() => result.current.setField('title', 'Т'))
    act(() => result.current.setField('description', 'Д'))
    act(() => { body = result.current.submit() })
    expect(body).toEqual({ productId: 'p1', agentId: 'a1', title: 'Т', description: 'Д' })
    expect(result.current.errors).toEqual({})
  })

  it('clearAgent empties the agent but keeps the typed text', () => {
    const { result } = renderHook(() => useBugForm(products, 'a1'))
    act(() => result.current.setField('title', 'Т'))
    act(() => result.current.clearAgent())
    expect(result.current.values).toMatchObject({ agentId: '', title: 'Т', productId: 'p1' })
  })
})
