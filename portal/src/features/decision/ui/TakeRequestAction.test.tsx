import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestClient, json, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { TakeRequestAction } from './TakeRequestAction'

const newRequest = { ...requestFixture, status: { code: 'new' as const, label: 'Новая' }, reviewer: null, takenAt: null }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAction(onTaken = vi.fn(), onConflict = vi.fn()) {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <TakeRequestAction request={newRequest} onTaken={onTaken} onConflict={onConflict} />
    </Wrapper>
  )
  return { onTaken, onConflict }
}

describe('TakeRequestAction', () => {
  it('shows the title, the explanation, the button and the hint', () => {
    stubFetch(() => json({}, 404))
    renderAction()
    expect(screen.getByRole('heading', { name: 'Заявка ещё не в работе' })).toBeTruthy()
    expect(screen.getByText(/Возьмите заявку, чтобы оценить её и принять решение/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Взять в работу' })).toBeTruthy()
    expect(screen.getByText('Решение сможет принять любой разработчик')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Принять|Отклонить/ })).toBeNull()
  })

  it('disables the button while the request is in flight and calls onTaken with the taken request', async () => {
    const taken = { ...requestFixture }
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    vi.stubGlobal('fetch', async (url: string) => {
      expect(String(url)).toContain(`/portal/requests/${requestFixture.id}/take`)
      await gate
      return json(taken)
    })
    const { onTaken } = renderAction()
    await userEvent.click(screen.getByRole('button', { name: 'Взять в работу' }))
    const busy = await screen.findByRole('button', { name: 'Берём в работу…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    release()
    await vi.waitFor(() => expect(onTaken).toHaveBeenCalledTimes(1))
    expect(onTaken.mock.calls[0][0].status.code).toBe('under_review')
  })

  it('shows an Alert with the server message on 409', async () => {
    stubFetch(() => json({ message: 'Заявку уже взяли', code: 'PORTAL_REQUEST_ALREADY_TAKEN' }, 409))
    const { onTaken, onConflict } = renderAction()
    await userEvent.click(screen.getByRole('button', { name: 'Взять в работу' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Заявку уже взяли')
    expect(onTaken).not.toHaveBeenCalled()
    expect(onConflict).toHaveBeenCalledTimes(1)
  })
})
