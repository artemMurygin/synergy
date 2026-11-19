import type { ChatModelAdapter } from '@assistant-ui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { must } from '../test-utils'
import { Composer } from './Composer'
import { useComposerAttachments } from './attachments/use-composer-attachments'
import { RuntimeHarness, fakePort } from './test-helpers'

const calls: { text: string; runConfig: unknown }[] = []
const adapter: ChatModelAdapter = {
  async *run({ messages, runConfig }) {
    await Promise.resolve()
    const last = messages.at(-1)
    const part = last?.content.at(0)
    calls.push({ text: part?.type === 'text' ? part.text : '', runConfig })
    yield { content: [{ type: 'text', text: 'ok' }] }
  },
}

function Subject({ port, disabled }: { port: ReturnType<typeof fakePort>['port']; disabled?: boolean }) {
  const attachments = useComposerAttachments(port)
  return <Composer attachments={attachments} disabled={disabled} />
}

function setup(disabled?: boolean) {
  calls.length = 0
  const fake = fakePort()
  render(
    <RuntimeHarness adapter={adapter}>
      <Subject port={fake.port} disabled={disabled} />
    </RuntimeHarness>,
  )
  return { ...fake, user: userEvent.setup() }
}

describe('Composer', () => {
  it('has the field, the attach button and a round send button with an arrow', () => {
    setup()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    const send = screen.getByRole('button', { name: 'Отправить' })
    expect(send.className).toContain('rounded-full')
    expect(send.querySelector('svg')).not.toBeNull()
  })

  it('has no microphone and no "Изменить" buttons', () => {
    setup()
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.some((n) => /микрофон|голос|Изменить/i.test(n))).toBe(false)
  })

  it('blocks sending an empty message', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
  })

  it('sends the text with the button and with Enter', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('textbox'), 'первый')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(calls.map((c) => c.text)).toEqual(['первый'])
    })
    await user.type(screen.getByRole('textbox'), 'второй{Enter}')
    await waitFor(() => {
      expect(calls.map((c) => c.text)).toEqual(['первый', 'второй'])
    })
  })

  it('is blocked when disabled', () => {
    setup(true)
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Прикрепить файл' }).hasAttribute('disabled')).toBe(true)
  })

  it('attaches picked files, blocks sending while they upload and sends their ids', async () => {
    const { user, uploads } = setup()
    const picker = screen.getByLabelText('Выбрать файлы')
    const file = new File(['x'], 'отчёт.pdf', { type: 'application/pdf' })
    await user.upload(picker, file)
    expect(screen.getByText('отчёт.pdf')).toBeTruthy()
    expect(screen.getByText('Дождитесь загрузки файлов')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
    await act(async () => {
      uploads[0]?.resolve('f1')
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
    })
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(calls).toHaveLength(1)
    })
    expect(calls[0]?.runConfig).toMatchObject({ custom: { fileIds: ['f1'] } })
    expect(screen.queryByText('отчёт.pdf')).toBeNull()
  })

  it('accepts files dropped on the form', () => {
    const { uploads } = setup()
    const file = new File(['x'], 'сводка.xlsx')
    fireEvent.drop(must(screen.getByRole('textbox').closest('form')), {
      dataTransfer: { types: ['Files'], files: [file] },
    })
    expect(uploads.map((u) => u.file.name)).toEqual(['сводка.xlsx'])
  })

  it('removes an attached file with its tile action', async () => {
    const { user, uploads } = setup()
    await user.upload(screen.getByLabelText('Выбрать файлы'), new File(['x'], 'a.pdf'))
    await act(async () => {
      uploads[0]?.resolve('f1')
      await Promise.resolve()
    })
    await user.click(await screen.findByRole('button', { name: 'Убрать: a.pdf' }))
    expect(screen.queryByText('a.pdf')).toBeNull()
  })

  it('shows the limit notice and closes it', async () => {
    const { user } = setup()
    const files = [1, 2, 3, 4, 5, 6].map((n) => new File(['x'], `${String(n)}.pdf`))
    await user.upload(screen.getByLabelText('Выбрать файлы'), files)
    expect(screen.getByRole('alert').textContent).toContain('не больше 5 файлов')
    await user.click(screen.getByRole('button', { name: 'Закрыть сообщение' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
