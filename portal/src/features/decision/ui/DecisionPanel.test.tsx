import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { agentFixture, json, page, queryWrapper, requestFixture, skillFixture, stubFetch, type FetchCall } from '@/test/helpers'
import { DecisionPanel } from './DecisionPanel'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const PRODUCTS = [
  { id: 'p1', slug: 'manager-helper', name: 'Manager Helper' },
  { id: 'p2', slug: 'telegram', name: 'Telegram-бот' }
]

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
      <DecisionPanel request={requestFixture} products={PRODUCTS} onDecided={onDecided} />
    </Wrapper>
  )
  const decisions = () => stub.calls.filter((c) => c.method === 'POST')
  return { onDecided, decisions, stub, user: userEvent.setup() }
}

const EFFORT = /Оценка трудозатрат/

async function fillNewAgent(user: ReturnType<typeof userEvent.setup>, opts: { agent?: string; product?: boolean; newProduct?: string } = {}) {
  await user.click(screen.getByRole('button', { name: 'Новый агент' }))
  if (opts.agent) await user.type(screen.getByLabelText('Название агента'), opts.agent)
  if (opts.product) await user.click(screen.getByRole('checkbox', { name: 'Telegram-бот' }))
  if (opts.newProduct) await user.type(screen.getByLabelText(/Новый продукт/), opts.newProduct)
  await user.type(screen.getByLabelText('Название навыка'), 'Сверка')
  await user.type(screen.getByLabelText('Что делает'), 'Сверяет')
  await user.type(screen.getByLabelText(EFFORT), '12')
}

describe('DecisionPanel', () => {
  it('shows who took the request under the title', () => {
    setup()
    expect(screen.getByText(/В работе у Петров Пётр · с 1[01] ноября/)).toBeTruthy()
  })

  it('shows the effort field only in accept mode, above the skill picker', async () => {
    const { user } = setup()
    const field = screen.getByLabelText(EFFORT)
    const chip = screen.getByRole('button', { name: 'Существующий' })
    expect(field.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Отклонить' }))
    expect(screen.queryByLabelText(EFFORT)).toBeNull()
  })

  it.each([['', 'пустая'], ['0', 'нулевая'], ['2.5', 'дробная']])('does not send a %s (%s) estimate', async (text) => {
    const { user, decisions } = setup()
    await screen.findByRole('option', { name: /Сводка встречи/ })
    await user.selectOptions(screen.getByLabelText('Навык'), 's1')
    if (text) await user.type(screen.getByLabelText(EFFORT), text)
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }))
    expect(screen.getByLabelText(EFFORT).getAttribute('aria-invalid')).toBe('true')
    expect(decisions()).toHaveLength(0)
  })

  it('does not send the estimate when rejecting', async () => {
    const { user, decisions, onDecided } = setup()
    await user.type(screen.getByLabelText(EFFORT), '5')
    await user.click(screen.getByRole('button', { name: 'Отклонить' }))
    await user.type(screen.getByLabelText('Причина отказа'), 'нет')
    await user.click(screen.getByRole('button', { name: 'Отклонить заявку' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]?.body).toEqual({ reason: 'нет' })
  })

  it('accepts with a new agent and a checked product', async () => {
    const { user, decisions, onDecided } = setup()
    await fillNewAgent(user, { agent: ' Бухгалтер ', product: true })
    await user.click(screen.getByRole('button', { name: 'Создать и принять' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]?.body).toEqual({
      effortHours: 12,
      target: {
        kind: 'new_agent',
        agent: { name: 'Бухгалтер', productIds: ['p2'] },
        skill: { name: 'Сверка', description: 'Сверяет' }
      }
    })
  })

  it('accepts a new agent with only a new product', async () => {
    const { user, decisions, onDecided } = setup()
    await fillNewAgent(user, { agent: 'Бухгалтер', newProduct: 'Веб' })
    await user.click(screen.getByRole('button', { name: 'Создать и принять' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]?.body).toMatchObject({
      target: { kind: 'new_agent', agent: { name: 'Бухгалтер', productIds: [], newProduct: { name: 'Веб' } } }
    })
  })

  it('shows errors for a new agent without a name or a product', async () => {
    const { user, decisions } = setup()
    await fillNewAgent(user)
    await user.click(screen.getByRole('button', { name: 'Создать и принять' }))
    expect(screen.getByLabelText('Название агента').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('group', { name: /Продукты/ }).getAttribute('aria-describedby')).toBeTruthy()
    expect(decisions()).toHaveLength(0)
  })

  it.each([
    ['PORTAL_AGENT_NAME_TAKEN', 'Агент с таким названием уже есть', 'Название агента'],
    ['PORTAL_PRODUCT_NAME_TAKEN', 'Продукт с таким названием уже есть', 'Новый продукт']
  ])('on 409 %s keeps the values and marks the name field', async (code, message, label) => {
    const { user, stub, onDecided } = setup(() => json({ code, message }, 409))
    await fillNewAgent(user, { agent: 'Бухгалтер', product: true, newProduct: code.includes('PRODUCT') ? 'Веб' : undefined })
    await user.click(screen.getByRole('button', { name: 'Создать и принять' }))
    expect((await screen.findByRole('alert')).textContent).toContain(message)
    expect(screen.getAllByText('Название занято').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(new RegExp(label)).getAttribute('aria-invalid')).toBe('true')
    expect((screen.getByLabelText('Название навыка') as HTMLInputElement).value).toBe('Сверка')
    expect(onDecided).not.toHaveBeenCalled()
    expect(stub.calls.filter((c) => c.method === 'GET' && c.path === '/portal/requests')).toHaveLength(0)
  })

  it('on 409 archived refreshes skills and agents and keeps the panel usable', async () => {
    const { user, stub } = setup(() => json({ code: 'PORTAL_SKILL_ARCHIVED', message: 'x' }, 409))
    await screen.findByRole('option', { name: /Сводка встречи/ })
    await user.selectOptions(screen.getByLabelText('Навык'), 's1')
    await user.type(screen.getByLabelText(EFFORT), '3')
    const before = stub.calls.filter((c) => c.path === '/portal/skills').length
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }))
    await screen.findByRole('alert')
    await vi.waitFor(() => expect(stub.calls.filter((c) => c.path === '/portal/skills').length).toBeGreaterThan(before))
  })

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

  it('accepts into an existing skill with an effort estimate', async () => {
    const { user, decisions, onDecided } = setup()
    await screen.findByRole('option', { name: /Сводка встречи/ })
    await user.selectOptions(screen.getByLabelText('Навык'), 's1')
    await user.type(screen.getByLabelText(EFFORT), '16')
    await user.click(screen.getByRole('button', { name: 'Принять заявку' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]).toMatchObject({
      path: `/portal/requests/${requestFixture.id}/accept`,
      body: { effortHours: 16, target: { kind: 'existing_skill', skillId: 's1' } }
    })
  })

  it('accepts with a new skill', async () => {
    const { user, decisions, onDecided } = setup()
    await user.click(screen.getByRole('button', { name: 'Новый навык' }))
    await user.selectOptions(await screen.findByLabelText('Агент'), 'a1')
    await user.type(screen.getByLabelText('Название навыка'), 'Сверка актов')
    await user.type(screen.getByLabelText('Что делает'), 'Сверяет')
    await user.type(screen.getByLabelText(EFFORT), '8')
    await user.click(screen.getByRole('button', { name: 'Создать навык и принять' }))
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(decisions()[0]?.body).toEqual({
      effortHours: 8,
      target: { kind: 'new_skill', agentId: 'a1', name: 'Сверка актов', description: 'Сверяет' }
    })
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
