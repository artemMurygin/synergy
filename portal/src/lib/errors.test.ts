import { describe, expect, it } from 'vitest'
import { ApiError, toApiError, unavailableError } from './errors'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('toApiError', () => {
  it.each([
    [400, 'bad_request'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict']
  ] as const)('maps HTTP %i to kind %s', async (status, kind) => {
    const error = await toApiError(json(status, { message: 'm' }))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe(kind)
    expect(error.status).toBe(status)
  })

  it('keeps the server message and code', async () => {
    const error = await toApiError(json(409, { message: 'Заявка уже решена', code: 'REQUEST_ALREADY_DECIDED' }))
    expect(error.message).toBe('Заявка уже решена')
    expect(error.code).toBe('REQUEST_ALREADY_DECIDED')
  })

  it('falls back to a status line when the body is not JSON', async () => {
    const error = await toApiError(new Response('boom', { status: 400 }))
    expect(error.kind).toBe('bad_request')
    expect(error.message).toBe('Сервер ответил ошибкой 400')
    expect(error.code).toBeNull()
  })

  it('treats other statuses as unexpected', async () => {
    expect((await toApiError(json(500, {}))).kind).toBe('unexpected')
    expect((await toApiError(json(422, {}))).kind).toBe('unexpected')
  })

  it('joins message arrays of a validation error', async () => {
    const error = await toApiError(json(400, { message: ['a', 'b'] }))
    expect(error.message).toBe('a; b')
  })
})

describe('unavailableError', () => {
  it('is distinct from every HTTP error and has no status', () => {
    const error = unavailableError()
    expect(error.kind).toBe('unavailable')
    expect(error.status).toBeNull()
    expect(error).toBeInstanceOf(ApiError)
  })
})
