import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileUploadError } from '@synergy/ui-kit'
import { clearAccessToken, setAccessToken } from '@/shared/auth/access-token-store'
import { useFileUploadPort } from './use-file-upload-port'

vi.mock('@/shared/settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

class FakeXhr {
  static last: FakeXhr
  upload = {
    listeners: {} as Record<string, (event: unknown) => void>, // eslint-disable-line @typescript-eslint/consistent-type-assertions -- test double
    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners[type] = listener
    },
  }
  listeners: Record<string, () => void> = {}
  headers: Record<string, string> = {}
  status = 0
  responseText = ''
  method = ''
  url = ''
  body: unknown = null
  aborted = false
  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = listener
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {
    this.aborted = true
    this.listeners.abort?.()
  }
  finish(status: number, body: unknown) {
    this.status = status
    this.responseText = JSON.stringify(body)
    this.listeners.load?.()
  }
}

const stored = {
  id: 'f1',
  name: 'a.pdf',
  mediaType: 'application/pdf',
  kind: 'document',
  sizeBytes: 3,
  status: 'active',
  awaitingProcessing: false,
  uploadedAt: '2026-11-12T10:00:00.000Z',
  expiresAt: null,
  deletedAt: null,
}

const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' })

/** The upload starts after the backend url is read: wait until the request exists. */
async function started(): Promise<FakeXhr> {
  await vi.waitFor(() => {
    expect(FakeXhr.last.body).not.toBeNull()
  })
  return FakeXhr.last
}

beforeEach(() => {
  FakeXhr.last = new FakeXhr()
  setAccessToken('tok')
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})

afterEach(() => {
  clearAccessToken()
  vi.unstubAllGlobals()
})

describe('useFileUploadPort', () => {
  it('posts the file to {backendUrl}/files with the bearer token and resolves the file id', async () => {
    const { result } = renderHook(() => useFileUploadPort())
    const promise = result.current.upload(file, {})
    const xhr = await started()
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('http://api.test/files')
    expect(xhr.headers.authorization).toBe('Bearer tok')
    expect(xhr.body).toBeInstanceOf(FormData)
    if (xhr.body instanceof FormData) expect(xhr.body.get('file')).toBeInstanceOf(File)
    xhr.finish(201, stored)
    await expect(promise).resolves.toEqual({ fileId: 'f1' })
  })

  it('reports the progress as a fraction', async () => {
    const { result } = renderHook(() => useFileUploadPort())
    const onProgress = vi.fn()
    void result.current.upload(file, { onProgress }).catch(() => undefined)
    const xhr = await started()
    xhr.upload.listeners.progress?.({ lengthComputable: true, loaded: 1, total: 4 })
    xhr.upload.listeners.progress?.({ lengthComputable: false, loaded: 1, total: 0 })
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(0.25)
  })

  it('aborts the request when the signal fires', async () => {
    const { result } = renderHook(() => useFileUploadPort())
    const controller = new AbortController()
    const promise = result.current.upload(file, { signal: controller.signal })
    const xhr = await started()
    controller.abort()
    expect(xhr.aborted).toBe(true)
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not start when the signal is already aborted', async () => {
    const { result } = renderHook(() => useFileUploadPort())
    const controller = new AbortController()
    controller.abort()
    await expect(result.current.upload(file, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(FakeXhr.last.body).toBeNull()
  })

  it('turns the refusals of the server into ready texts', async () => {
    const { result } = renderHook(() => useFileUploadPort())
    const promise = result.current.upload(file, {})
    const xhr = await started()
    xhr.finish(415, { message: 'unsupported' })
    await expect(promise).rejects.toThrow(FileUploadError)
    await expect(promise).rejects.toThrow('Этот тип файла не поддерживается')
  })

  it('names the limit on 413', async () => {
    const { result } = renderHook(() => useFileUploadPort())
    const promise = result.current.upload(file, {})
    const xhr = await started()
    xhr.finish(413, { message: 'File is larger than 26214400 bytes' })
    await expect(promise).rejects.toThrow('Файл больше 25 МБ')
  })
})
