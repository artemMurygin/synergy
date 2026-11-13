import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { RequestForm } from './RequestForm'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [] })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderForm(onSubmitted = vi.fn()) {
  const Wrapper = queryWrapper()
  render(
    <Wrapper>
      <RequestForm onSubmitted={onSubmitted} />
    </Wrapper>
  )
  return onSubmitted
}

async function fill(user: ReturnType<typeof userEvent.setup>, overrides: Partial<Record<string, string>> = {}) {
  const v = { title: 'Сверка актов', description: 'Сверяю вручную', count: '5', minutes: '20', people: '3', ...overrides }
  await user.type(screen.getByLabelText('Название'), v.title)
  await user.type(screen.getByLabelText('Описание процесса'), v.description)
  await user.type(screen.getByLabelText('Сколько раз'), v.count)
  await user.type(screen.getByLabelText('Минут за один раз'), v.minutes)
  await user.type(screen.getByLabelText('Сколько человек так делают'), v.people)
}

describe('RequestForm', () => {
  it('has labelled fields and the three periods', () => {
    renderForm()
    for (const label of ['Название', 'Описание процесса', 'Сколько раз', 'Минут за один раз', 'Сколько человек так делают']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    for (const label of ['в день', 'в неделю', 'в месяц']) expect(screen.getByLabelText(label)).toBeTruthy()
  })

  it('does not submit invalid data and shows errors at the fields', async () => {
    const { fn } = stubFetch(() => json(requestFixture, 201))
    const onSubmitted = renderForm()
    const user = userEvent.setup()
    await fill(user, { title: ' ', minutes: '0' })
    await user.click(screen.getByRole('button', { name: 'Отправить идею' }))
    const title = screen.getByLabelText('Название')
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(title.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByLabelText('Минут за один раз').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Сколько раз').getAttribute('aria-invalid')).toBeNull()
    expect(fn).not.toHaveBeenCalled()
    expect(onSubmitted).not.toHaveBeenCalled()
  })

  it('submits the body and reports the created request', async () => {
    const { calls } = stubFetch(() => json(requestFixture, 201))
    const onSubmitted = renderForm()
    const user = userEvent.setup()
    await fill(user)
    await user.click(screen.getByLabelText('в месяц'))
    await user.click(screen.getByRole('button', { name: 'Отправить идею' }))
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1))
    expect(calls[0]?.body).toEqual({
      title: 'Сверка актов',
      description: 'Сверяю вручную',
      frequency: { count: 5, period: 'month' },
      minutesPerRun: 20,
      peopleCount: 3
    })
  })

  it('keeps the typed values and shows the message when the server fails', async () => {
    stubFetch(() => json({ message: 'Что-то сломалось' }, 500))
    const onSubmitted = renderForm()
    const user = userEvent.setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Отправить идею' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Что-то сломалось/)
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Сверка актов')
    expect((screen.getByLabelText('Минут за один раз') as HTMLInputElement).value).toBe('20')
    expect(onSubmitted).not.toHaveBeenCalled()
  })

  it('can be filled and submitted with the keyboard only', async () => {
    const { calls } = stubFetch(() => json(requestFixture, 201))
    const onSubmitted = renderForm()
    const user = userEvent.setup()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Название'))
    await user.keyboard('Акты')
    await user.tab()
    await user.keyboard('Описание')
    await user.tab()
    await user.keyboard('2')
    await user.tab()
    expect(document.activeElement?.getAttribute('type')).toBe('radio')
    await user.tab()
    await user.keyboard('10')
    await user.tab()
    await user.keyboard('4')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Отправить идею' }))
    await user.keyboard('{Enter}')
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalled())
    expect(calls[0]?.body).toMatchObject({ title: 'Акты', minutesPerRun: 10, peopleCount: 4 })
  })
})
