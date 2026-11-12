import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError, FileTooLargeError, UnsupportedFileTypeError } from '@/lib/backend/errors'
import * as filesApi from '@/lib/backend/files.api'
import type { UploadOptions } from '@/lib/backend/files.api'
import type { StoredFile } from '@/lib/backend/files.schema'
import {
  GONE_NOTICE,
  LIMIT_NOTICE,
  OFFLINE_TEXT,
  useComposerAttachments
} from './use-composer-attachments'

vi.mock('@/lib/backend/files.api')

function storedFile(id: string, name: string, overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id,
    name,
    mediaType: 'audio/mp4',
    kind: 'recording',
    sizeBytes: 1024,
    status: 'active',
    awaitingProcessing: true,
    uploadedAt: '2026-11-12T10:00:00.000Z',
    expiresAt: null,
    deletedAt: null,
    ...overrides
  }
}

interface Pending {
  file: File
  options: UploadOptions
  resolve: (file: StoredFile) => void
  reject: (error: unknown) => void
}

let pending: Pending[]

function file(name: string, type = 'audio/mp4', size = 2048): File {
  return new File([new Uint8Array(size)], name, { type })
}

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useComposerAttachments(), { wrapper })
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

afterEach(() => {
  vi.useRealTimers()
})

describe('useComposerAttachments', () => {
  it('starts uploading right after a file is added and reports progress', async () => {
    const { result } = setup()
    act(() => {
      result.current.add([file('встреча.m4a')])
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({ name: 'встреча.m4a', status: 'uploading', kind: 'recording' })
    expect(result.current.isUploading).toBe(true)
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    act(() => {
      pending[0]?.options.onProgress?.(0.62)
    })
    expect(result.current.items[0]?.progress).toBeCloseTo(0.62)
  })

  it('collects the ids of uploaded files in the order they were added', async () => {
    const { result } = setup()
    act(() => {
      result.current.add([file('a.m4a'), file('b.pdf', 'application/pdf')])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(2)
    })
    await act(async () => {
      pending[1]?.resolve(storedFile('f2', 'b.pdf', { kind: 'document' }))
      pending[0]?.resolve(storedFile('f1', 'a.m4a'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.isUploading).toBe(false)
    })
    expect(result.current.readyFileIds).toEqual(['f1', 'f2'])
    expect(result.current.items.map((i) => i.status)).toEqual(['ready', 'ready'])
  })

  it('does not add a sixth file and shows the limit notice for 4 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = setup()
    act(() => {
      result.current.add([1, 2, 3, 4, 5, 6].map((n) => file(`${String(n)}.m4a`)))
    })
    expect(result.current.items).toHaveLength(5)
    expect(result.current.notice).toBe(LIMIT_NOTICE)
    act(() => {
      result.current.add([file('7.m4a')])
    })
    expect(result.current.items).toHaveLength(5)
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(result.current.notice).toBeNull()
  })

  it('cancels an upload: the request is aborted and the card disappears', async () => {
    const { result } = setup()
    act(() => {
      result.current.add([file('большая.m4a')])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    const key = result.current.items[0]?.key ?? ''
    await act(async () => {
      result.current.cancel(key)
      await Promise.resolve()
    })
    expect(pending[0]?.options.signal?.aborted).toBe(true)
    await waitFor(() => {
      expect(result.current.items).toHaveLength(0)
    })
    expect(result.current.isUploading).toBe(false)
  })

  it.each([
    [new UnsupportedFileTypeError('Этот тип файла не поддерживается'), 'Этот тип файла не поддерживается'],
    [new FileTooLargeError('Файл больше 1 ГБ', 1024 ** 3), 'Файл больше 1 ГБ'],
    [new FileTooLargeError('Файл больше 50 МБ', 50 * 1024 ** 2), 'Файл больше 50 МБ'],
    [new BackendError('Не удалось связаться с сервером. Он запущен?'), OFFLINE_TEXT]
  ])('puts the reason of a failed upload on the card: %s', async (error, text) => {
    const { result } = setup()
    act(() => {
      result.current.add([file('x.xlsx', 'application/vnd.ms-excel')])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    await act(async () => {
      pending[0]?.reject(error)
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe('error')
    })
    expect(result.current.items[0]?.error).toBe(text)
    expect(result.current.readyFileIds).toEqual([])
    expect(result.current.isUploading).toBe(false)
  })

  it('retries a failed upload with the same file', async () => {
    const { result } = setup()
    const original = file('a.m4a')
    act(() => {
      result.current.add([original])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    await act(async () => {
      pending[0]?.reject(new BackendError('Failed to fetch'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe('error')
    })
    const key = result.current.items[0]?.key ?? ''
    act(() => {
      result.current.retry(key)
    })
    expect(result.current.items[0]?.status).toBe('uploading')
    await waitFor(() => {
      expect(pending).toHaveLength(2)
    })
    expect(pending[1]?.file).toBe(original)
    await act(async () => {
      pending[1]?.resolve(storedFile('f1', 'a.m4a'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.readyFileIds).toEqual(['f1'])
    })
  })

  it('removes a file: it no longer goes into the message', async () => {
    const { result } = setup()
    act(() => {
      result.current.add([file('a.m4a')])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    await act(async () => {
      pending[0]?.resolve(storedFile('f1', 'a.m4a'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.readyFileIds).toEqual(['f1'])
    })
    act(() => {
      result.current.remove(result.current.items[0]?.key ?? '')
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.readyFileIds).toEqual([])
  })

  it('takes the ready files on send and gives them back with the expired one failed', async () => {
    const { result } = setup()
    act(() => {
      result.current.add([file('a.m4a'), file('b.pdf', 'application/pdf')])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(2)
    })
    await act(async () => {
      pending[0]?.resolve(storedFile('f1', 'a.m4a'))
      pending[1]?.resolve(storedFile('f2', 'b.pdf', { kind: 'document' }))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.readyFileIds).toEqual(['f1', 'f2'])
    })
    let sent: StoredFile[] = []
    act(() => {
      sent = result.current.take()
    })
    expect(sent.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(result.current.items).toHaveLength(0)

    act(() => {
      result.current.restoreExpired('f2')
    })
    expect(result.current.notice).toBe(GONE_NOTICE)
    expect(result.current.items.map((i) => [i.name, i.status])).toEqual([
      ['a.m4a', 'ready'],
      ['b.pdf', 'error']
    ])
    expect(result.current.readyFileIds).toEqual(['f1'])
  })
})
