import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { bugFixture } from '../model/bugs.fixtures'
import type { BugFormProduct } from '../model/bug-form'
import { BugForm } from './BugForm'

const products: BugFormProduct[] = [
  { id: 'p1', name: 'Manager Helper', agents: [{ id: 'a1', name: 'Ассистент' }] },
  { id: 'p2', name: 'Telegram-бот', agents: [{ id: 'a1', name: 'Ассистент' }, { id: 'a2', name: 'Протоколист' }] }
]

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderForm(props: { initialAgentId?: string; onReported?: (id: string) => void } = {}) {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter>
        <BugForm products={products} initialAgentId={props.initialAgentId} onReported={props.onReported ?? vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>
    </Wrapper>
  )
}

describe('BugForm', () => {
  it('disables the agent field until a product is chosen', async () => {
    renderForm()
    const agent = screen.getByLabelText('Агент') as HTMLSelectElement
    expect(agent.disabled).toBe(true)
    await userEvent.setup().selectOptions(screen.getByLabelText('Продукт'), 'p1')
    expect(agent.disabled).toBe(false)
  })

  it('shows errors next to the empty fields and sends nothing', async () => {
    const { calls } = stubFetch(() => json(bugFixture, 201))
    renderForm()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Выберите продукт')).toBeTruthy()
    expect(screen.getByText('Опишите, что случилось')).toBeTruthy()
    expect(screen.getByText('Добавьте подробности')).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it('disables the button while sending and reports the new id', async () => {
    let release: (r: Response) => void = () => undefined
    stubFetch(() => new Promise<Response>((resolve) => (release = resolve)))
    const onReported = vi.fn()
    renderForm({ onReported })
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Продукт'), 'p1')
    await user.selectOptions(screen.getByLabelText('Агент'), 'a1')
    await user.type(screen.getByLabelText(/Что случилось/), 'Не отвечает')
    await user.type(screen.getByLabelText(/Подробности/), 'Нажал отправить')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    const sending = (await screen.findByRole('button', { name: 'Отправляем…' })) as HTMLButtonElement
    expect(sending.disabled).toBe(true)
    release(json(bugFixture, 201))
    await waitFor(() => expect(onReported).toHaveBeenCalledWith(bugFixture.id))
  })

  it('on 409 shows an alert, empties the agent and keeps the typed text', async () => {
    stubFetch(() => json({ code: 'PORTAL_AGENT_ARCHIVED', message: 'archived' }, 409))
    renderForm()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Продукт'), 'p2')
    await user.selectOptions(screen.getByLabelText('Агент'), 'a2')
    await user.type(screen.getByLabelText(/Что случилось/), 'Не отвечает')
    await user.type(screen.getByLabelText(/Подробности/), 'Нажал отправить')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Агент больше недоступен')).toBeTruthy()
    expect((screen.getByLabelText('Агент') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText(/Что случилось/) as HTMLInputElement).value).toBe('Не отвечает')
    expect((screen.getByLabelText(/Подробности/) as HTMLTextAreaElement).value).toBe('Нажал отправить')
  })

  it('preselects product and agent when the agent belongs to one product', () => {
    renderForm({ initialAgentId: 'a2' })
    expect((screen.getByLabelText('Продукт') as HTMLSelectElement).value).toBe('p2')
    expect((screen.getByLabelText('Агент') as HTMLSelectElement).value).toBe('a2')
  })
})
