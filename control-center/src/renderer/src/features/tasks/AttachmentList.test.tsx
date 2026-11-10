import './test-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttachmentLimitError, AttachmentTooLargeError, TaskNotFoundError } from '@/lib/backend/errors'
import * as tasksApi from '@/lib/backend/tasks.api'
import type { Attachment } from '@/lib/backend/tasks.schema'
import { saveBlob } from '@/lib/save-blob'
import { AttachmentList, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from './AttachmentList'

vi.mock('@/lib/backend/tasks.api')
vi.mock('@/lib/save-blob')

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

const mkAttachment = (id: string, originalName = `file-${id}.pdf`): Attachment => ({
  id,
  taskId: 't1',
  originalName,
  sizeBytes: 1_500_000,
  contentType: 'application/pdf',
  uploadedBy: 'u1',
  createdAt: '2026-03-01T00:00:00Z'
})

const mkFile = (name = 'КП.pdf', size?: number): File => {
  const file = new File(['x'], name, { type: 'application/pdf' })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}

function setup(attachments: Attachment[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <AttachmentList taskId="t1" attachments={attachments} />
    </QueryClientProvider>
  )
  return { invalidate, user: userEvent.setup() }
}

const picker = () => screen.getByLabelText('Выбрать файлы') as HTMLInputElement

describe('AttachmentList', () => {
  it('lists attachments with name and size', () => {
    setup([mkAttachment('a1', 'Коммерческое предложение.pdf')])
    expect(screen.getByText('Коммерческое предложение.pdf')).toBeTruthy()
    expect(screen.getByText('1,4 МБ')).toBeTruthy()
  })

  it('uploads files chosen in the dialog', async () => {
    vi.mocked(tasksApi.uploadAttachment).mockResolvedValue(mkAttachment('a2'))
    const { user, invalidate } = setup()
    await user.upload(picker(), mkFile('КП.pdf'))
    await waitFor(() => expect(tasksApi.uploadAttachment).toHaveBeenCalledTimes(1))
    const [taskId, file, options] = vi.mocked(tasksApi.uploadAttachment).mock.calls[0]
    expect(taskId).toBe('t1')
    expect((file as File).name).toBe('КП.pdf')
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] }))
  })

  it('uploads files dropped on the attachments area', async () => {
    vi.mocked(tasksApi.uploadAttachment).mockResolvedValue(mkAttachment('a2'))
    setup()
    const zone = screen.getByRole('region', { name: 'Вложения' })
    fireEvent.dragEnter(zone, { dataTransfer: { files: [mkFile('Схема.png')], types: ['Files'] } })
    expect(screen.getByText('Отпустите файлы, чтобы прикрепить')).toBeTruthy()
    fireEvent.drop(zone, { dataTransfer: { files: [mkFile('Схема.png')], types: ['Files'] } })
    await waitFor(() => expect(tasksApi.uploadAttachment).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Отпустите файлы, чтобы прикрепить')).toBeNull()
  })

  it('shows an indeterminate indicator that can be cancelled', async () => {
    vi.mocked(tasksApi.uploadAttachment).mockImplementation(
      (_id, _file, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Загрузка отменена', 'AbortError')))
        })
    )
    const { user } = setup()
    await user.upload(picker(), mkFile('КП.pdf'))
    const bar = await screen.findByRole('progressbar', { name: 'Загрузка: КП.pdf' })
    expect(bar.getAttribute('aria-valuenow')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Отменить загрузку: КП.pdf' }))
    expect(vi.mocked(tasksApi.uploadAttachment).mock.calls[0][2]?.signal?.aborted).toBe(true)
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('explains a 413 response', async () => {
    vi.mocked(tasksApi.uploadAttachment).mockRejectedValue(new AttachmentTooLargeError('too big'))
    const { user } = setup()
    await user.upload(picker(), mkFile('Отчёт.zip'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Файл слишком большой: максимум 20 МБ')
    expect(alert.textContent).toContain('Отчёт.zip')
  })

  it('explains a 422 attachment limit response', async () => {
    vi.mocked(tasksApi.uploadAttachment).mockRejectedValue(new AttachmentLimitError('limit'))
    const { user } = setup()
    await user.upload(picker(), mkFile('Схема.png'))
    expect((await screen.findByRole('alert')).textContent).toContain('Достигнут лимит: не больше 10 файлов на задачу')
  })

  it('rejects an oversized file before sending', async () => {
    const { user } = setup()
    await user.upload(picker(), mkFile('big.bin', MAX_ATTACHMENT_BYTES + 1))
    expect((await screen.findByRole('alert')).textContent).toContain('Файл слишком большой: максимум 20 МБ')
    expect(tasksApi.uploadAttachment).not.toHaveBeenCalled()
  })

  it('rejects files above the count limit before sending', async () => {
    const existing = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => mkAttachment(`a${String(i)}`))
    const { user } = setup(existing)
    await user.upload(picker(), mkFile('one-more.pdf'))
    expect((await screen.findByRole('alert')).textContent).toContain('Достигнут лимит: не больше 10 файлов на задачу')
    expect(tasksApi.uploadAttachment).not.toHaveBeenCalled()
  })

  it('downloads under the original name', async () => {
    const blob = new Blob(['x'])
    vi.mocked(tasksApi.downloadAttachment).mockResolvedValue({ blob, fileName: 'Коммерческое.pdf' })
    const { user } = setup([mkAttachment('a1', 'Коммерческое.pdf')])
    await user.click(screen.getByRole('button', { name: 'Скачать: Коммерческое.pdf' }))
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'Коммерческое.pdf'))
    expect(tasksApi.downloadAttachment).toHaveBeenCalledWith('t1', 'a1')
  })

  it('refreshes the details when the downloaded attachment is gone (404)', async () => {
    vi.mocked(tasksApi.downloadAttachment).mockRejectedValue(new TaskNotFoundError('gone'))
    const { user, invalidate } = setup([mkAttachment('a1', 'f.pdf')])
    await user.click(screen.getByRole('button', { name: 'Скачать: f.pdf' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] }))
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('deletes only after confirmation', async () => {
    vi.mocked(tasksApi.deleteAttachment).mockResolvedValue(undefined)
    const { user } = setup([mkAttachment('a1', 'f.pdf')])
    await user.click(screen.getByRole('button', { name: 'Удалить вложение: f.pdf' }))
    let dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(tasksApi.deleteAttachment).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Удалить вложение: f.pdf' }))
    dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(tasksApi.deleteAttachment).toHaveBeenCalledWith('t1', 'a1'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('refreshes the details when the deleted attachment is already gone (404)', async () => {
    vi.mocked(tasksApi.deleteAttachment).mockRejectedValue(new TaskNotFoundError('gone'))
    const { user, invalidate } = setup([mkAttachment('a1', 'f.pdf')])
    await user.click(screen.getByRole('button', { name: 'Удалить вложение: f.pdf' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
