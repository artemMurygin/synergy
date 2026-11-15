import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { emptyGuideFixture, guideFixture } from '../model/guides.fixtures'
import { GuideEditor } from './GuideEditor'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: ['developer'], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(initialBody = 'Привет') {
  const onDone = vi.fn()
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <GuideEditor initialBody={initialBody} agentId="a1" onDone={onDone} />
    </Wrapper>
  )
  return { onDone }
}

const box = () => screen.getByRole('textbox', { name: 'Текст инструкции' }) as HTMLTextAreaElement
const type = (value: string) => fireEvent.change(box(), { target: { value } })

describe('GuideEditor', () => {
  it('has a monospace field, the tabs "Текст" / "Просмотр" and switches to a markdown preview', async () => {
    setup('## Заголовок')
    expect(box().className).toContain('font-mono')
    expect(screen.getByRole('tab', { name: 'Текст', selected: true })).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Просмотр' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Текст' }))
    expect(box().value).toBe('## Заголовок')
  })

  it('always shows the counter "N / 50 000" and it stays neutral within the limit', () => {
    setup('12345')
    expect(screen.getByText('5 / 50 000').className).not.toContain('text-brand-red')
    type('x'.repeat(50000))
    expect(screen.getByText('50 000 / 50 000').className).not.toContain('text-brand-red')
    expect(screen.getByRole('button', { name: 'Сохранить' }).hasAttribute('disabled')).toBe(false)
  })

  it('turns the counter red over the limit, explains it and blocks saving', () => {
    const { fn } = stubFetch(() => json(guideFixture))
    setup()
    type('x'.repeat(50312))
    expect(screen.getByText('50 312 / 50 000').className).toContain('text-brand-red')
    expect(screen.getByText('Текст длиннее 50 000 символов. Сократите его на 312 символов, чтобы сохранить')).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Сохранить' })
    expect(save.hasAttribute('disabled')).toBe(true)
    fireEvent.click(save)
    expect(fn).not.toHaveBeenCalled()
  })

  it('saves the text and closes the editor', async () => {
    const { calls } = stubFetch(() => json(guideFixture))
    const { onDone } = setup()
    type('Новый текст')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/portal/agents/a1/guide', body: { body: 'Новый текст' } })
  })

  it('disables saving and cancelling while the request is in flight', async () => {
    stubFetch(() => new Promise<Response>(() => undefined))
    setup()
    type('Новый текст')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    const saving = await screen.findByRole('button', { name: 'Сохраняем…' })
    expect(saving.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Отмена' }).hasAttribute('disabled')).toBe(true)
  })

  it('asks "Удалить инструкцию?" for an empty text and deletes on confirmation', async () => {
    const { calls } = stubFetch(() => json(emptyGuideFixture))
    const { onDone } = setup()
    type('   ')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByRole('alertdialog', { name: 'Удалить инструкцию?' })).toBeTruthy()
    expect(calls).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { body: '   ' } })
  })

  it('"Вернуться к тексту" closes the delete dialog without a request', async () => {
    const { calls } = stubFetch(() => json(emptyGuideFixture))
    setup()
    type('')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await userEvent.click(screen.getByRole('button', { name: 'Вернуться к тексту' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(calls).toHaveLength(0)
    expect(box().value).toBe('')
  })

  it('cancels at once without changes and asks for confirmation with changes', async () => {
    const { onDone } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    type('Правка')
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.getByRole('alertdialog', { name: 'Отменить изменения?' })).toBeTruthy()
    expect(onDone).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить правку' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(box().value).toBe('Правка')
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    await userEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(onDone).toHaveBeenCalledTimes(2)
  })

  it('keeps the text and shows an error with "Повторить" when saving fails', async () => {
    let fail = true
    stubFetch(() => (fail ? json({ message: 'x' }, 500) : json(guideFixture)))
    const { onDone } = setup()
    type('Важный текст')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Не удалось сохранить инструкцию')).toBeTruthy()
    expect(box().value).toBe('Важный текст')
    expect(onDone).not.toHaveBeenCalled()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('keeps the text and says the agent is archived on 409', async () => {
    stubFetch(() => json({ code: 'PORTAL_AGENT_ARCHIVED', message: 'x' }, 409))
    const { onDone } = setup()
    type('Текст')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Агент перенесён в архив')).toBeTruthy()
    expect(box().value).toBe('Текст')
    expect(onDone).not.toHaveBeenCalled()
  })
})
