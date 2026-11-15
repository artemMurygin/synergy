import { describe, expect, it } from 'vitest'
import { requestSchema } from '@/lib/schemas'
import { REQUEST_BADGE_CLASS, REQUEST_STATUS_LABEL } from '@/lib/status-labels'
import { parseRequestForm, type RequestFormValues } from './requests.schema'

const valid: RequestFormValues = {
  title: 'Сверка актов',
  description: 'Сверяю акты вручную',
  count: '5',
  period: 'week',
  minutesPerRun: '20',
  peopleCount: '3'
}

describe('parseRequestForm', () => {
  it('turns correct values into the request body', () => {
    expect(parseRequestForm(valid)).toEqual({
      ok: true,
      data: {
        title: 'Сверка актов',
        description: 'Сверяю акты вручную',
        frequency: { count: 5, period: 'week' },
        minutesPerRun: 20,
        peopleCount: 3
      }
    })
  })

  it('trims title and description', () => {
    const result = parseRequestForm({ ...valid, title: '  Акты  ', description: ' текст ' })
    expect(result.ok && result.data.title).toBe('Акты')
    expect(result.ok && result.data.description).toBe('текст')
  })

  it('reports an empty title (spaces only) at the title field', () => {
    const result = parseRequestForm({ ...valid, title: '   ' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors.title).toBeTruthy()
    expect(!result.ok && Object.keys(result.errors)).toEqual(['title'])
  })

  it('reports an empty description', () => {
    const result = parseRequestForm({ ...valid, description: '' })
    expect(!result.ok && result.errors.description).toBeTruthy()
  })

  it.each(['0', '-1', '2.5', '', 'abc'])('rejects %j as minutes per run', (value) => {
    const result = parseRequestForm({ ...valid, minutesPerRun: value })
    expect(!result.ok && result.errors.minutesPerRun).toBeTruthy()
  })

  it.each([
    ['count', '0'],
    ['count', '1.5'],
    ['peopleCount', '0'],
    ['peopleCount', '3.2']
  ] as const)('rejects zero and fractional %s=%s', (field, value) => {
    const result = parseRequestForm({ ...valid, [field]: value })
    expect(!result.ok && result.errors[field]).toBeTruthy()
  })

  it('rejects an unknown period', () => {
    const result = parseRequestForm({ ...valid, period: 'year' })
    expect(!result.ok && result.errors.period).toBeTruthy()
  })

  it('collects errors of several fields at once', () => {
    const result = parseRequestForm({ ...valid, title: '', minutesPerRun: '0' })
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['minutesPerRun', 'title'])
  })
})

describe('request response schema (reviewer fields)', () => {
  const base = {
    id: 'r1',
    title: 't',
    description: 'd',
    frequency: { count: 1, period: 'day' },
    minutesPerRun: 1,
    peopleCount: 1,
    status: { code: 'under_review', label: 'На рассмотрении' },
    author: { id: 'u1', login: 'a', fullName: 'A' },
    reviewer: { id: 'd1', login: 'dev', fullName: 'Dev' },
    takenAt: '2026-01-01T00:00:00.000Z',
    effortHours: null,
    rejectReason: null,
    skill: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  }

  it('accepts reviewer, takenAt and a null effortHours', () => {
    expect(requestSchema.safeParse(base).success).toBe(true)
  })

  it('requires the reviewer fields to be present', () => {
    const { reviewer: _r, ...without } = base
    expect(requestSchema.safeParse(without).success).toBe(false)
  })

  it('rejects a non-numeric effortHours', () => {
    expect(requestSchema.safeParse({ ...base, effortHours: '16' }).success).toBe(false)
  })
})

describe('status labels', () => {
  it('names new and under_review in Russian', () => {
    expect(REQUEST_STATUS_LABEL.new).toBe('Новая')
    expect(REQUEST_STATUS_LABEL.under_review).toBe('На рассмотрении')
  })

  it('has badge classes for the new statuses', () => {
    expect(REQUEST_BADGE_CLASS.new).toMatch(/bg-surface-sunken.*text-ink-80/)
    expect(REQUEST_BADGE_CLASS.under_review).toMatch(/bg-purple-soft.*text-ink-80/)
  })
})
