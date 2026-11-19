import type { AssistantRuntime, ChatModelAdapter } from '@assistant-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'
import { useComposerAttachments } from './attachments/use-composer-attachments'
import { RuntimeHarness, Sender, fakePort } from './test-helpers'
import { Thread, type ThreadProps } from './Thread'

type Props = Partial<ThreadProps>

function Subject(props: Props) {
  const attachments = useComposerAttachments(fakePort().port)
  return (
    <Thread
      serverRunning={false}
      onRetry={() => undefined}
      onCancel={() => undefined}
      composer={<Composer attachments={attachments} />}
      {...props}
    />
  )
}

function mount(adapter: ChatModelAdapter, props: Props = {}, send?: string) {
  let runtime: AssistantRuntime | undefined
  render(
    <RuntimeHarness
      adapter={adapter}
      onRuntime={(r) => {
        runtime = r
      }}
    >
      {send !== undefined && <Sender text={send} />}
      <Subject {...props} />
    </RuntimeHarness>,
  )
  return { runtime: () => runtime, user: userEvent.setup() }
}

const answering = (text: string): ChatModelAdapter => ({
  async *run() {
    await Promise.resolve()
    yield { content: [{ type: 'text', text }] }
  },
})

const failing: ChatModelAdapter = {
  run: () => Promise.reject(new Error('Агент вернул ошибку')),
}

const hanging: ChatModelAdapter = {
  async *run({ abortSignal }) {
    await new Promise<void>((resolve) => {
      abortSignal.addEventListener('abort', () => {
        resolve()
      })
    })
    yield { content: [{ type: 'text', text: 'часть ответа' }] }
  },
}

describe('Thread', () => {
  it('shows the welcome state for a new chat', () => {
    mount(answering('x'))
    expect(screen.getByRole('heading', { name: 'Чем помочь?' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('lets the app replace the empty state', () => {
    mount(answering('x'), { empty: <p>Своё пустое состояние</p> })
    expect(screen.getByText('Своё пустое состояние')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Чем помочь?' })).toBeNull()
  })

  it('shows the question and the markdown answer, set in the chat font', async () => {
    mount(answering('Цена **420 000 ₽**'), {}, 'Сколько стоит МВА?')
    const question = await screen.findByText('Сколько стоит МВА?')
    expect(question.closest('[class*="font-chat"]')).not.toBeNull()
    const strong = await screen.findByText('420 000 ₽')
    expect(strong.tagName).toBe('STRONG')
    expect(screen.queryByRole('heading', { name: 'Чем помочь?' })).toBeNull()
  })

  it('shows a failed run as a notice with "Повторить"', async () => {
    const onRetry = vi.fn()
    const { user } = mount(failing, { onRetry }, 'вопрос')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не удалось получить ответ')
    expect(alert.textContent).toContain('Агент вернул ошибку')
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('marks a stopped answer', async () => {
    const { runtime, user } = mount(hanging, {}, 'вопрос')
    await screen.findByRole('button', { name: 'Остановить' })
    runtime()?.thread.cancelRun()
    expect(await screen.findByText('Ответ остановлен')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Остановить' })).toBeNull()
    })
    expect(user).toBeTruthy()
  })

  it('shows "Остановить" instead of send while the run goes, and calls onCancel', async () => {
    const onCancel = vi.fn()
    const { user } = mount(hanging, { onCancel }, 'вопрос')
    const stop = await screen.findByRole('button', { name: 'Остановить' })
    expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull()
    await user.click(stop)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows "Остановить" and blocks the field while the server runs the agent', async () => {
    const onCancel = vi.fn()
    const { user } = mount(answering('x'), { serverRunning: true, onCancel })
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('Агент ещё отвечает')
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Чем помочь?' })).toBeNull()
  })

  it('shows the connection error with the text from props', () => {
    mount(answering('x'), { runError: 'Не удалось связаться с сервером. Проверьте адрес бэкенда в настройках расширения.' })
    expect(screen.getByRole('alert').textContent).toContain('Проверьте адрес бэкенда в настройках расширения')
  })

  it('offers next steps under a finished overview and sends the chosen one', async () => {
    const { user } = mount(answering('Подборка:\n1. MBA\n2. Executive MBA'), {}, 'подбери')
    const step = await screen.findByRole('button', { name: 'Вступительные' })
    await user.click(step)
    expect(await screen.findByText('Какие вступительные испытания у программ из списка?')).toBeTruthy()
  })

  it('hides next steps while answering and after an error', async () => {
    mount(hanging, {}, 'вопрос')
    await screen.findByRole('button', { name: 'Остановить' })
    expect(screen.queryByRole('group', { name: 'Подсказки' })).toBeNull()
  })

  it('hides next steps after a failed run', async () => {
    const flaky: ChatModelAdapter = {
      run: () => Promise.reject(new Error('1. a\n2. b')),
    }
    mount(flaky, {}, 'вопрос')
    await screen.findByRole('alert')
    expect(screen.queryByRole('group', { name: 'Подсказки' })).toBeNull()
  })

  it('shows the tool calls of an answer as one group', async () => {
    const withTools: ChatModelAdapter = {
      async *run() {
        await Promise.resolve()
        yield {
          content: [
            { type: 'tool-call', toolCallId: 't1', toolName: 'search_books', args: {}, argsText: '{}', result: 'ok' },
            { type: 'text', text: 'Готово' },
          ],
        }
      },
    }
    mount(withTools, {}, 'найди')
    expect(await screen.findByRole('button', { name: /1 вызов инструментов/ })).toBeTruthy()
  })
})
