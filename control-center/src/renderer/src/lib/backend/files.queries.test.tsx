import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import * as filesApi from './files.api'
import { useCreateDownloadLink, useUploadFile } from './files.queries'
import type { StoredFile } from './files.schema'

vi.mock('./files.api')

const stored: StoredFile = {
  id: 'f1',
  name: 'встреча.m4a',
  mediaType: 'audio/mp4',
  kind: 'recording',
  sizeBytes: 5,
  status: 'active',
  awaitingProcessing: true,
  uploadedAt: '2026-11-12T10:00:00.000Z',
  expiresAt: null,
  deletedAt: null
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useUploadFile', () => {
  it('uploads the file with progress and signal options', async () => {
    vi.mocked(filesApi.uploadFile).mockResolvedValue(stored)
    const file = new File(['audio'], 'встреча.m4a')
    const options = { onProgress: vi.fn(), signal: new AbortController().signal }
    const { result } = renderHook(() => useUploadFile(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync({ file, options })).resolves.toEqual(stored)
    })
    expect(filesApi.uploadFile).toHaveBeenCalledWith(file, options)
  })
})

describe('useCreateDownloadLink', () => {
  it('requests a link for the file id', async () => {
    const link = { url: 'cc-api://backend/files/f1/content?token=t', expiresAt: 'x' }
    vi.mocked(filesApi.createDownloadLink).mockResolvedValue(link)
    const { result } = renderHook(() => useCreateDownloadLink(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync('f1')).resolves.toEqual(link)
    })
    expect(filesApi.createDownloadLink).toHaveBeenCalledWith('f1')
  })
})
