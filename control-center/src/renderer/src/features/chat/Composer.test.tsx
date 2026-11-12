import './test-env'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelRunOptions } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError, FileTooLargeError, UnsupportedFileTypeError } from '@/lib/backend/errors'
import * as filesApi from '@/lib/backend/files.api'
import type { UploadOptions } from '@/lib/backend/files.api'
import type { StoredFile } from '@/lib/backend/files.schema'
import { Composer } from './Composer'
import { useComposerAttachments } from './use-composer-attachments'

vi.mock('@/lib/backend/files.api')

afterEach(cleanup)

interface Pending {
  file: File
  options: UploadOptions
  resolve: (file: StoredFile) => void
  reject: (error: unknown) => void
}

let pending: Pending[]

function storedFile(id: string, name: string): StoredFile {
  return {
    id,
    name,
    mediaType: 'audio/mp4',
    kind: 'recording',
    sizeBytes: 84 * 1024 * 1024,
    status: 'active',
    awaitingProcessing: true,
    uploadedAt: '2026-11-12T10:00:00.000Z',
    expiresAt: null,
    deletedAt: null
  }
}

const recording = (name = 'встреча.m4a') => new File([new Uint8Array(2048)], name, { type: 'audio/mp4' })

function Host({ children, run }: { children: ReactNode; run: (options: ChatModelRunOptions) => void }) {
  const runtime = useLocalRuntime({
    run: async function* (options) {
      run(options)
      yield { content: [{ type: 'text' as const, text: 'ok' }] }
    }
  })
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

type ComposerProps = Parameters<typeof Composer>[0]

function WithAttachments(props: Omit<ComposerProps, 'attachments'>) {
  const attachments = useComposerAttachments()
  return <Composer {...props} attachments={attachments} />
}

function setup(props: Partial<Omit<ComposerProps, 'attachments'>> = {}) {
  const run = vi.fn<(options: ChatModelRunOptions) => void>()
  const onStop = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Host run={run}>
        <WithAttachments running={false} disabled={false} onStop={onStop} {...props} />
      </Host>
    </QueryClientProvider>
  )
  return { run, onStop, user: userEvent.setup() }
}

const field = () => screen.getByPlaceholderText('Вопрос агенту') as HTMLTextAreaElement
const sendButton = () => screen.getByRole('button', { name: 'Отправить' }) as HTMLButtonElement
const picker = () => screen.getByLabelText('Выбрать файлы') as HTMLInputElement

async function attach(user: ReturnType<typeof userEvent.setup>, files: File[]) {
  await user.upload(picker(), files)
  await waitFor(() => {
    expect(pending.length).toBeGreaterThanOrEqual(Math.min(files.length, 5))
  })
}

async function finish(index: number, file: StoredFile) {
  await act(async () => {
    pending[index]?.resolve(file)
    await Promise.resolve()
  })
}

async function fail(index: number, error: unknown) {
  await act(async () => {
    pending[index]?.reject(error)
    await Promise.resolve()
  })
}

beforeEach(() => {
  pending = []
  vi.mocked(filesApi.uploadFile).mockImplementation(
    (f: File, options: UploadOptions = {}) =>
      new Promise<StoredFile>((resolve, reject) => {
        pending.push({ file: f, options, resolve, reject })
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('Загрузка отменена', 'AbortError'))
        })
      })
  )
})

describe('Composer', () => {
  it('does not send an empty or blank message', async () => {
    const { run, user } = setup()
    expect(sendButton().disabled).toBe(true)
    await user.type(field(), '   {Enter}')
    expect(run).not.toHaveBeenCalled()
  })

  it('sends the question on Enter and clears the field', async () => {
    const { run, user } = setup()
    await user.type(field(), 'сколько стоит{Enter}')
    expect(run).toHaveBeenCalledTimes(1)
    expect(field().value).toBe('')
  })

  it('shows "Остановить" instead of send while the agent answers', async () => {
    const { onStop, user } = setup({ running: true })
    expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('keeps a draft typed during the run when the run state changes', async () => {
    const { user } = setup({ running: true })
    await user.type(field(), 'черновик')
    expect(field().value).toBe('черновик')
  })

  it('blocks the field when disabled', () => {
    setup({ disabled: true })
    expect(field().disabled).toBe(true)
  })

  it('opens the file picker with the allowed types from the "Прикрепить файл" button', async () => {
    const { user } = setup()
    const click = vi.spyOn(picker(), 'click')
    await user.click(screen.getByRole('button', { name: 'Прикрепить файл' }))
    expect(click).toHaveBeenCalled()
    expect(picker().multiple).toBe(true)
    expect(picker().accept).toContain('.m4a')
    expect(picker().accept).toContain('.docx')
  })

  it('shows the card with progress, blocks sending while uploading and hints to wait', async () => {
    const { run, user } = setup()
    await attach(user, [recording()])
    expect(screen.getByText('встреча.m4a')).toBeTruthy()
    act(() => {
      pending[0]?.options.onProgress?.(0.62)
    })
    expect(screen.getByRole('progressbar', { name: 'Загрузка: встреча.m4a' }).getAttribute('aria-valuenow')).toBe('62')
    expect(screen.getByText('62%')).toBeTruthy()
    expect(screen.getByText('Дождитесь загрузки файлов')).toBeTruthy()

    await user.type(field(), 'расшифруй{Enter}')
    expect(sendButton().disabled).toBe(true)
    expect(run).not.toHaveBeenCalled()
    expect(field().value).toBe('расшифруй')
  })

  it('cancels an upload: the card disappears and sending is possible again', async () => {
    const { user } = setup()
    await user.type(field(), 'вопрос')
    await attach(user, [recording()])
    expect(sendButton().disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Отменить загрузку: встреча.m4a' }))
    await waitFor(() => {
      expect(screen.queryByText('встреча.m4a')).toBeNull()
    })
    expect(pending[0]?.options.signal?.aborted).toBe(true)
    expect(sendButton().disabled).toBe(false)
  })

  it('sends a message with only a file and passes its id to the run', async () => {
    const { run, user } = setup()
    await attach(user, [recording()])
    await finish(0, storedFile('f1', 'встреча.m4a'))
    await waitFor(() => {
      expect(sendButton().disabled).toBe(false)
    })
    expect(screen.queryByText('Дождитесь загрузки файлов')).toBeNull()
    await user.click(sendButton())
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1)
    })
    expect(run.mock.calls[0]?.[0].runConfig?.custom).toMatchObject({ fileIds: ['f1'] })
    await waitFor(() => {
      expect(screen.queryByText('встреча.m4a')).toBeNull()
    })
  })

  it('sends the text together with the uploaded files on Enter', async () => {
    const { run, user } = setup()
    await attach(user, [recording('a.m4a'), recording('b.m4a')])
    await finish(0, storedFile('f1', 'a.m4a'))
    await finish(1, storedFile('f2', 'b.m4a'))
    await waitFor(() => {
      expect(sendButton().disabled).toBe(false)
    })
    await user.type(field(), 'расшифруй{Enter}')
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1)
    })
    const options = run.mock.calls[0]?.[0]
    expect(options?.runConfig?.custom).toMatchObject({ fileIds: ['f1', 'f2'] })
    const last = options?.messages.at(-1)
    expect(last?.content).toEqual([{ type: 'text', text: 'расшифруй' }])
    expect(field().value).toBe('')
  })

  it('does not add a sixth file and shows the limit notice', async () => {
    const { user } = setup()
    await attach(user, [1, 2, 3, 4, 5, 6].map((n) => recording(`${String(n)}.m4a`)))
    expect(screen.getByText('5.m4a')).toBeTruthy()
    expect(screen.queryByText('6.m4a')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('К сообщению можно приложить не больше 5 файлов')
  })

  it.each([
    [new UnsupportedFileTypeError('Этот тип файла не поддерживается'), 'Этот тип файла не поддерживается'],
    [new FileTooLargeError('Файл больше 1 ГБ', 1024 ** 3), 'Файл больше 1 ГБ'],
    [new FileTooLargeError('Файл больше 50 МБ', 50 * 1024 ** 2), 'Файл больше 50 МБ'],
    [new BackendError('Не удалось связаться с сервером. Он запущен?'), 'Нет связи с сервером. Повторите загрузку']
  ])('shows the error on the card and does not send the file: %s', async (error, text) => {
    const { run, user } = setup()
    await attach(user, [recording()])
    await fail(0, error)
    expect(await screen.findByText(text)).toBeTruthy()
    expect(sendButton().disabled).toBe(true)
    await user.type(field(), 'вопрос{Enter}')
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1)
    })
    expect(run.mock.calls[0]?.[0].runConfig?.custom?.fileIds).toBeUndefined()
  })

  it('retries a failed upload and removes a card', async () => {
    const { user } = setup()
    await attach(user, [recording()])
    await fail(0, new BackendError('Failed to fetch'))
    const card = (await screen.findByText('Нет связи с сервером. Повторите загрузку')).closest('li')
    expect(card).toBeTruthy()
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Повторить: встреча.m4a' }))
    await waitFor(() => {
      expect(pending).toHaveLength(2)
    })
    expect(screen.queryByText('Нет связи с сервером. Повторите загрузку')).toBeNull()
    await finish(1, storedFile('f1', 'встреча.m4a'))
    await user.click(await screen.findByRole('button', { name: 'Убрать: встреча.m4a' }))
    expect(screen.queryByText('встреча.m4a')).toBeNull()
  })
})
