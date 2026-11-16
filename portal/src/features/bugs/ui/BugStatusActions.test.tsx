import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { bugFixture } from '../model/bugs.fixtures'
import type { Bug, BugStatus } from '../model/bugs.schema'
import { BugStatusActions } from './BugStatusActions'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function bugWith(status: BugStatus, nextStatuses: BugStatus[]): Bug {
  return { ...bugFixture, status, nextStatuses, statusChangedBy: { id: 'd1', login: 'dev', fullName: 'Иван Петров' } }
}

function renderActions(bug: Bug) {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <BugStatusActions bug={bug} />
    </Wrapper>
  )
}

const names = () => screen.getAllByRole('button').map((b) => b.textContent)

describe('BugStatusActions', () => {
  it.each([
    ['open', ['in_progress', 'wont_fix'], ['Взять в работу', 'Не будет исправлен']],
    ['in_progress', ['resolved', 'wont_fix', 'open'], ['Исправлен', 'Не будет исправлен', 'Вернуть в очередь']],
    ['resolved', ['in_progress'], ['Переоткрыть']],
    ['wont_fix', ['in_progress'], ['Переоткрыть']]
  ] as [BugStatus, BugStatus[], string[]][])('for %s shows the buttons by nextStatuses', (status, next, expected) => {
    renderActions(bugWith(status, next))
    expect(names()).toEqual(expected)
  })

  it('shows only the buttons of nextStatuses', () => {
    renderActions(bugWith('in_progress', ['resolved']))
    expect(names()).toEqual(['Исправлен'])
  })

  it('sends the status and disables every button during the request', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const calls: { path: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ path: new URL(url).pathname, body: JSON.parse(String(init?.body ?? '{}')) })
      await gate
      return json({ ...bugFixture, status: 'resolved' })
    })
    renderActions(bugWith('in_progress', ['resolved', 'wont_fix', 'open']))
    await user.click(screen.getByRole('button', { name: 'Исправлен' }))
    await waitFor(() => {
      for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
    })
    release()
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ path: `/portal/bugs/${bugFixture.id}/status`, body: { status: 'resolved' } })
  })

  it('asks for a reason before wont_fix and sends it', async () => {
    const user = userEvent.setup()
    const { calls } = stubFetch(() => json({ ...bugFixture, status: 'wont_fix', wontFixReason: 'Повтор' }))
    renderActions(bugWith('open', ['in_progress', 'wont_fix']))
    expect(screen.queryByRole('button', { name: 'Не будет исправлен' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Не будет исправлен' }))
    expect(calls).toHaveLength(0)
    await user.type(screen.getByLabelText('Причина'), 'Повтор')
    await user.click(screen.getByRole('button', { name: 'Закрыть без исправления' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({ status: 'wont_fix', reason: 'Повтор' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows «Статус бага уже изменился» on 409', async () => {
    const user = userEvent.setup()
    stubFetch(() => json({ code: 'PORTAL_BUG_INVALID_TRANSITION', message: 'x' }, 409))
    renderActions(bugWith('in_progress', ['resolved', 'wont_fix', 'open']))
    await user.click(screen.getByRole('button', { name: 'Вернуть в очередь' }))
    expect(await screen.findByText('Статус бага уже изменился')).toBeTruthy()
  })
})
