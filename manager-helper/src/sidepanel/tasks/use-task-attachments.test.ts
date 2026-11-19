import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileUploadPort } from '@synergy/ui-kit'
import type * as TasksApi from '@/shared/tasks-api'
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  deleteAttachment,
  downloadAttachment,
} from '@/shared/tasks-api'
import { saveBlob } from '@/shared/save-blob'
import { useTaskAttachments } from './use-task-attachments'

vi.mock('@/shared/tasks-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TasksApi>()),
  deleteAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
  uploadAttachment: vi.fn(),
}))
vi.mock('@/shared/save-blob', () => ({ saveBlob: vi.fn() }))

const MB = 1024 * 1024
const file = (size = 10) => new File([new Uint8Array(size)], 'КП.pdf')
const options = () => ({ onProgress: vi.fn(), signal: new AbortController().signal })
const existing = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `a${String(i)}`, originalName: 'f', sizeBytes: 1 }))

const upload = vi.fn<FileUploadPort['upload']>()
const port: FileUploadPort = { upload }
const onChanged = vi.fn<() => void>()

function setup(count = 0) {
  return renderHook(() =>
    useTaskAttachments({ taskId: 't1', attachments: existing(count), port, onChanged }),
  )
}

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ fileId: 'a9' })
  onChanged.mockReset()
  vi.mocked(deleteAttachment).mockReset().mockResolvedValue(undefined)
  vi.mocked(downloadAttachment).mockReset()
  vi.mocked(saveBlob).mockReset()
})

describe('useTaskAttachments', () => {
  it('uploads through the port with progress and refreshes the list', async () => {
    const { result } = setup()
    const o = options()
    await act(() => result.current.onUpload(file(), o))
    expect(upload).toHaveBeenCalledWith(expect.any(File), o)
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('refuses a file over the limit without a request', async () => {
    const { result } = setup()
    await expect(result.current.onUpload(file(21 * MB), options())).rejects.toThrow(
      'Файл слишком большой: максимум 20 МБ',
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses the 11th file', async () => {
    const { result } = setup(10)
    await expect(result.current.onUpload(file(), options())).rejects.toThrow(
      'Достигнут лимит: не больше 10 файлов на задачу',
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it('shows the 413 and 422 errors of the server as readable messages', async () => {
    const { result } = setup()
    upload.mockRejectedValueOnce(new AttachmentTooLargeError('x'))
    await expect(result.current.onUpload(file(), options())).rejects.toThrow(
      'Файл слишком большой: максимум 20 МБ',
    )
    upload.mockRejectedValueOnce(new AttachmentLimitError('x'))
    await expect(result.current.onUpload(file(), options())).rejects.toThrow(
      'Достигнут лимит: не больше 10 файлов на задачу',
    )
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('keeps an abort as is and shows a fallback for unknown errors', async () => {
    const { result } = setup()
    const abort = new DOMException('Загрузка отменена', 'AbortError')
    upload.mockRejectedValueOnce(abort)
    await expect(result.current.onUpload(file(), options())).rejects.toBe(abort)
    upload.mockRejectedValueOnce(new Error('Сервер ответил ошибкой 500'))
    await expect(result.current.onUpload(file(), options())).rejects.toThrow(
      'Сервер ответил ошибкой 500',
    )
  })

  it('deletes an attachment and refreshes the list', async () => {
    const { result } = setup(1)
    await act(() => result.current.onDelete({ id: 'a0', originalName: 'f', sizeBytes: 1 }))
    expect(deleteAttachment).toHaveBeenCalledWith('t1', 'a0')
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('reports a failed delete', async () => {
    vi.mocked(deleteAttachment).mockRejectedValue(new Error('нет доступа'))
    const { result } = setup(1)
    await expect(
      result.current.onDelete({ id: 'a0', originalName: 'f', sizeBytes: 1 }),
    ).rejects.toThrow('нет доступа')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('downloads and saves the file under its original name', async () => {
    const blob = new Blob(['x'])
    vi.mocked(downloadAttachment).mockResolvedValue({ blob, fileName: 'КП.pdf' })
    const { result } = setup(1)
    await result.current.onDownload({ id: 'a0', originalName: 'КП.pdf', sizeBytes: 1 })
    expect(downloadAttachment).toHaveBeenCalledWith('t1', 'a0')
    expect(saveBlob).toHaveBeenCalledWith(blob, 'КП.pdf')
  })
})
