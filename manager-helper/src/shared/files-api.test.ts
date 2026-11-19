import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from './auth/access-token-store'
import { resetAuthState } from './auth/auth-state'
import { downloadByLink, downloadFile } from './files-api'

vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const download = vi.fn()

beforeEach(() => {
  setAccessToken('tok')
  download.mockResolvedValue(1)
  vi.stubGlobal('chrome', { downloads: { download } })
})

afterEach(() => {
  clearAccessToken()
  resetAuthState()
  download.mockReset()
  vi.unstubAllGlobals()
})

describe('downloadFile', () => {
  it('asks for a signed link and hands it to chrome.downloads with the original name', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ url: '/files/f1/content?sig=abc', expiresAt: '2026-11-19T10:00:00Z' }))

    await downloadFile('f1', 'Договор №5.pdf')

    const url = fetchMock.mock.calls[0]?.[0]
    const init = fetchMock.mock.calls[0]?.[1]
    expect(url).toBe('http://api.test/files/f1/download-link')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok')
    expect(download).toHaveBeenCalledWith({
      url: 'http://api.test/files/f1/content?sig=abc',
      filename: 'Договор №5.pdf',
    })
  })

  it('reports an expired file', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'gone' }, 410))
    await expect(downloadFile('f1', 'a.pdf')).rejects.toThrow('Срок хранения файла истёк')
    expect(download).not.toHaveBeenCalled()
  })

  it('reports an unreachable server', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(downloadFile('f1', 'a.pdf')).rejects.toThrow('Не удалось связаться с сервером')
  })

  it('rejects an unexpected link body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ nope: 1 }))
    await expect(downloadFile('f1', 'a.pdf')).rejects.toThrow('неожиданном формате')
  })
})

describe('downloadByLink', () => {
  it('prefixes the backend url and passes the original name to chrome.downloads', async () => {
    await downloadByLink('/tasks/t1/attachments/a1/content?token=x', 'КП.pdf')
    expect(download).toHaveBeenCalledWith({
      url: 'http://api.test/tasks/t1/attachments/a1/content?token=x',
      filename: 'КП.pdf',
    })
  })

  it.each([
    ['Встреча 10:00.docx', 'Встреча 10_00.docx'],
    ['Отчёт "Q3".pdf', 'Отчёт _Q3_.pdf'],
    ['итог?.xlsx', 'итог_.xlsx'],
    ['план*<>|.xlsx', 'план____.xlsx'],
    ['Отчёт.', 'Отчёт'],
    ['  .. ', 'file'],
  ])('sanitizes the name %j for chrome.downloads', async (name, expected) => {
    await downloadByLink('/x?token=x', name)
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ filename: expected }))
  })
})
