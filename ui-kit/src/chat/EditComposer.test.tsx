import type { ChatModelAdapter } from '@assistant-ui/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'
import { useComposerAttachments } from './attachments/use-composer-attachments'
import { RuntimeHarness, Sender, fakePort } from './test-helpers'
import { Thread, type ThreadProps } from './Thread'

function Subject(props: Partial<ThreadProps>) {
  const attachments = useComposerAttachments(fakePort().port)
  return (
    <Thread
      serverRunning={false}
      onRetry={() => undefined}
      onCancel={() => undefined}
      isEditable={() => true}
      composer={<Composer attachments={attachments} />}
      {...props}
    />
  )
}

function setup(props: Partial<ThreadProps> = {}) {
  const run = vi.fn()
  const adapter: ChatModelAdapter = {
    async *run({ messages }) {
      await Promise.resolve()
      run(messages.at(-1)?.content)
      yield { content: [{ type: 'text', text: 'ответ агента' }] }
    },
  }
  render(
    <RuntimeHarness adapter={adapter}>
      <Sender text="старый вопрос" />
      <Subject {...props} />
    </RuntimeHarness>,
  )
  return { run, user: userEvent.setup() }
}

function formOf(field: HTMLElement): HTMLElement {
  const form = field.closest('form')
  if (form === null) throw new Error('no form')
  return form
}

async function startEdit(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('ответ агента')
  const edit = await screen.findByRole('button', { name: 'Изменить' })
  await waitFor(() => {
    expect(edit.hasAttribute('disabled')).toBe(false)
  })
  await user.click(edit)
  return screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Изменить сообщение' })
}

describe('EditComposer', () => {
  it('opens a field with the text and marks the next answer as to be replaced', async () => {
    const { user } = setup()
    const field = await startEdit(user)
    expect(field.value).toBe('старый вопрос')
    expect(screen.getByText('Будет заменён')).toBeTruthy()
  })

  it('closes on "Отмена" and on Escape without changes', async () => {
    const { user, run } = setup()
    const field = await startEdit(user)
    await user.type(field, ' лишнее')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('textbox', { name: 'Изменить сообщение' })).toBeNull()
    expect(screen.getByText('старый вопрос')).toBeTruthy()
    expect(screen.queryByText('Будет заменён')).toBeNull()

    await startEdit(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Изменить сообщение' })).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('disables "Отправить" for an empty text', async () => {
    const { user } = setup()
    const field = await startEdit(user)
    await user.clear(field)
    expect(within(formOf(field)).getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
  })

  it('reports the point and sends the edited text', async () => {
    const onEdit = vi.fn()
    const { user, run } = setup({ onEdit })
    const field = await startEdit(user)
    await user.clear(field)
    await user.type(field, 'новый вопрос')
    await user.click(within(formOf(field)).getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2)
    })
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(typeof onEdit.mock.calls[0]?.[0]).toBe('string')
    expect(await screen.findByText('новый вопрос')).toBeTruthy()
  })
})
