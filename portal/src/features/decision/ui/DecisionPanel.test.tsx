import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { agentFixture, json, page, queryWrapper, requestFixture, skillFixture, stubFetch, type FetchCall } from '@/test/helpers'
import { DecisionPanel } from './DecisionPanel'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'] })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(decide: (call: FetchCall) => Response = () => json(requestFixture)) {
  const stub = stubFetch((call) => {
    if (call.path === '/portal/agents') return json([agentFixture])
    if (call.path === '/portal/skills') return json(page([skillFixture]))
    return decide(call)
  })
  const onDecided = vi.fn()
  const Wrapper = queryWrapper()
  render(
    <Wrapper>
      <DecisionPanel request={requestFixture} onDecided={onDecided} />
    </Wrapper>
  )
  const decisions = () => stub.calls.filter((c) => c.method === 'POST')
  return { onDecided, decisions, user: userEvent.setup() }
}

describe('DecisionPanel', () => {
  it('switches between accept and reject', async () => {
    const { user } = setup()
    expect(screen.getByRole('button', { name: 'Принять в навык' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByLabelText('Причина отказа')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Отклонить' }))
    expect(screen.getByLabelText('Причина отказа')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отклонить' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('does not reject without a reason and shows the error at the reason field', async () => {
    const { user, decisions } = setup()
    await user.click(screen.getByRole('button', { name: 'Отклонить' }))
    await user.click(screen.getByRole('button', { name: 'Отклонить заявку' }))
    expect(screen.getByLabelText('Причина отказа').getAttribute('aria-invalid')).toBe('true')
    expect(decisions()).toHaveLength(0)
  })

  it('fills the reason from a quick reason chip', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Отклонить' }))
    await user.click(screen.getByRole('button', { name: 'Мало эффекта' }))
    expect((screen.getByLabelText('Причина отказа') as HTMLTextAreaElement).value).toBe('Мало эффекта')
  })

  it('rejects with a trimmed reason', async () => {
    const { user, decisions, onDecided } = setup()
    await user.click(screen.getByRole('button', { name: 'Отклонить' }))
    await user.type(screen.getByLabelText('Причина отказа'), '  Уже есть  ')
    await user.click(screen.getByRole('button', { name: 'Отклонить заявку' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]).toMatchObject({ path: `/portal/requests/${requestFixture.id}/reject`, body: { reason: 'Уже есть' } })
  })

  it('does not accept without a chosen skill', async () => {
    const { user, decisions } = setup()
    await screen.findByLabelText('Навык')
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }))
    expect(screen.getByLabelText('Навык').getAttribute('aria-invalid')).toBe('true')
    expect(decisions()).toHaveLength(0)
  })

  it('does not accept a new skill that is not filled in', async () => {
    const { user, decisions } = setup()
    await user.click(screen.getByRole('button', { name: 'Новый навык' }))
    await user.click(screen.getByRole('button', { name: 'Создать навык и принять' }))
    expect(screen.getByLabelText('Агент').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Название навыка').getAttribute('aria-invalid')).toBe('true')
    expect(decisions()).toHaveLength(0)
  })

  it('accepts into an existing skill with {skillId}', async () => {
    const { user, decisions, onDecided } = setup()
    await screen.findByRole('option', { name: /Сводка встречи/ })
    await user.selectOptions(screen.getByLabelText('Навык'), 's1')
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]).toMatchObject({ path: `/portal/requests/${requestFixture.id}/accept`, body: { skillId: 's1' } })
  })

  it('accepts with a new skill as {agentId,name,description}', async () => {
    const { user, decisions, onDecided } = setup()
    await user.click(screen.getByRole('button', { name: 'Новый навык' }))
    await user.selectOptions(await screen.findByLabelText('Агент'), 'a1')
    await user.type(screen.getByLabelText('Название навыка'), 'Сверка актов')
    await user.type(screen.getByLabelText('Что делает'), 'Сверяет')
    await user.click(screen.getByRole('button', { name: 'Создать навык и принять' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]?.body).toEqual({ agentId: 'a1', name: 'Сверка актов', description: 'Сверяет' })
  })

  it('shows "decision already made" on 409 and does not report success', async () => {
    const { user, onDecided } = setup(() => json({ message: 'x' }, 409))
    await user.click(screen.getByRole('button', { name: 'Отклонить' }))
    await user.type(screen.getByLabelText('Причина отказа'), 'нет')
    await user.click(screen.getByRole('button', { name: 'Отклонить заявку' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/уже принято/)
    expect(onDecided).not.toHaveBeenCalled()
  })
})
