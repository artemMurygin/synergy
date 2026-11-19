import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileUploadError, type FileUploadPort, type UploadOptions } from './file-upload-port'
import {
  GONE_NOTICE,
  LIMIT_NOTICE,
  OFFLINE_TEXT,
  useComposerAttachments,
} from './use-composer-attachments'

type Pending = {
  file: File
  options: UploadOptions
  resolve: (fileId: string) => void
  reject: (error: unknown) => void
}

let pending: Pending[]

const port: FileUploadPort = {
  upload: (file, options) =>
    new Promise((resolve, reject) => {
      pending.push({
        file,
        options,
        resolve: (fileId) => {
          resolve({ fileId })
        },
        reject,
      })
      options.signal?.addEventListener('abort', () => {
        reject(new DOMException('Загрузка отменена', 'AbortError'))
      })
    }),
}

function file(name: string, type = 'audio/mp4', size = 2048): File {
  return new File([new Uint8Array(size)], name, { type })
}

const setup = () => renderHook(() => useComposerAttachments(port))

beforeEach(() => {
  pending = []
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
    expect(result.current.items[0]).toMatchObject({
      name: 'встреча.m4a',
      status: 'uploading',
      kind: 'recording',
    })
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
      pending[1]?.resolve('f2')
      pending[0]?.resolve('f1')
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.isUploading).toBe(false)
    })
    expect(result.current.fileIds).toEqual(['f1', 'f2'])
    expect(result.current.items.map((i) => [i.status, i.kind])).toEqual([
      ['ready', 'recording'],
      ['ready', 'document'],
    ])
  })

  it('does not add a sixth file and shows the limit notice for 4 seconds', () => {
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

  it('cancels an upload through the signal and the card disappears', async () => {
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

  it.each<[() => Error, string]>([
    [() => new FileUploadError('Файл больше 50 МБ'), 'Файл больше 50 МБ'],
    [() => new TypeError('Failed to fetch'), OFFLINE_TEXT],
    [() => new Error('что-то внутреннее'), 'Не удалось загрузить файл'],
  ])('puts the reason of a failed upload on the card: %#', async (makeError, text) => {
    const { result } = setup()
    act(() => {
      result.current.add([file('x.xlsx', 'application/vnd.ms-excel')])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    await act(async () => {
      pending[0]?.reject(makeError())
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe('error')
    })
    expect(result.current.items[0]?.error).toBe(text)
    expect(result.current.fileIds).toEqual([])
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
      pending[0]?.reject(new TypeError('Failed to fetch'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe('error')
    })
    act(() => {
      result.current.retry(result.current.items[0]?.key ?? '')
    })
    expect(result.current.items[0]?.status).toBe('uploading')
    await waitFor(() => {
      expect(pending).toHaveLength(2)
    })
    expect(pending[1]?.file).toBe(original)
    await act(async () => {
      pending[1]?.resolve('f1')
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.fileIds).toEqual(['f1'])
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
      pending[0]?.resolve('f1')
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.fileIds).toEqual(['f1'])
    })
    act(() => {
      result.current.remove(result.current.items[0]?.key ?? '')
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.fileIds).toEqual([])
  })

  it('aborts uploads still in flight when the chat is left', async () => {
    const { result, unmount } = setup()
    act(() => {
      result.current.add([file('a.m4a')])
    })
    await waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    unmount()
    expect(pending[0]?.options.signal?.aborted).toBe(true)
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
      pending[0]?.resolve('f1')
      pending[1]?.resolve('f2')
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.fileIds).toEqual(['f1', 'f2'])
    })
    let sent: { id: string; name: string }[] = []
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
      ['b.pdf', 'error'],
    ])
    expect(result.current.items[1]?.canRetry).toBe(false)
    expect(result.current.fileIds).toEqual(['f1'])
  })
})
