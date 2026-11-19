import { renderHook } from '@testing-library/react'
import { FileUploadError } from '@synergy/ui-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError, FileTooLargeError } from '@/lib/backend/errors'
import * as filesApi from '@/lib/backend/files.api'
import type { StoredFile } from '@/lib/backend/files.schema'
import { useFileUploadPort } from './use-file-upload-port'

vi.mock('@/lib/backend/files.api')

const stored: StoredFile = {
  id: 'f1',
  name: 'a.pdf',
  mediaType: 'application/pdf',
  kind: 'document',
  sizeBytes: 10,
  status: 'active',
  awaitingProcessing: false,
  uploadedAt: '2026-11-12T10:00:00.000Z',
  expiresAt: null,
  deletedAt: null
}

const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useFileUploadPort', () => {
  it('uploads through the backend and returns the stored file id', async () => {
    vi.mocked(filesApi.uploadFile).mockResolvedValue(stored)
    const { result } = renderHook(() => useFileUploadPort())
    const signal = new AbortController().signal
    const onProgress = vi.fn()
    await expect(result.current.upload(file, { signal, onProgress })).resolves.toEqual({ fileId: 'f1' })
    expect(filesApi.uploadFile).toHaveBeenCalledWith(file, { signal, onProgress })
  })

  it('turns a backend refusal into an error with a ready text', async () => {
    vi.mocked(filesApi.uploadFile).mockRejectedValue(new FileTooLargeError('Файл больше 2 ГБ', null))
    const { result } = renderHook(() => useFileUploadPort())
    const failure = await result.current.upload(file, { onProgress: () => undefined }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(FileUploadError)
    expect(failure).toHaveProperty('message', 'Файл больше 2 ГБ')
  })

  it('lets an unreachable server pass as is, the composer words it', async () => {
    const offline = new BackendError('Не удалось связаться с сервером. Он запущен?')
    vi.mocked(filesApi.uploadFile).mockRejectedValue(offline)
    const { result } = renderHook(() => useFileUploadPort())
    await expect(result.current.upload(file, { onProgress: () => undefined })).rejects.toBe(offline)
  })

  it('keeps a cancelled upload an abort', async () => {
    const abort = new DOMException('Загрузка отменена', 'AbortError')
    vi.mocked(filesApi.uploadFile).mockRejectedValue(abort)
    const { result } = renderHook(() => useFileUploadPort())
    await expect(result.current.upload(file, { onProgress: () => undefined })).rejects.toBe(abort)
  })

  it('keeps the same port between renders', () => {
    const { result, rerender } = renderHook(() => useFileUploadPort())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
