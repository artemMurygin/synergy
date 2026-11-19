import { FileUploadError } from '@synergy/ui-kit'
import { z } from 'zod'
import { AskError, errorMessage } from './api'
import { getAccessToken } from './auth/access-token-store'
import { authFetch } from './auth/auth-fetch'
import { refreshAccessToken } from './auth/refresh-coordinator'
import { withClientApp } from './client-app'
import { getBackendUrl } from './settings'

const UNREACHABLE = 'Не удалось связаться с сервером. Он запущен?'
const GONE = 'Срок хранения файла истёк'
const MB = 1024 * 1024
const GB = 1024 * MB

const StoredFileSchema = z.object({ id: z.string() })
const DownloadLinkSchema = z.object({ url: z.string().startsWith('/') })

export interface UploadOptions {
  /** Fraction 0..1; called only when the total size is known. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

function abortError(): DOMException {
  return new DOMException('Загрузка отменена', 'AbortError')
}

/** The backend names the limit only in its message: "File is larger than N bytes". */
function limitText(message: string): string {
  const bytes = /(\d+)\s*bytes/i.exec(message)?.[1]
  if (bytes === undefined) return 'Файл больше допустимого размера'
  const size = Number(bytes)
  return size >= GB && size % GB === 0
    ? `Файл больше ${String(size / GB)} ГБ`
    : `Файл больше ${String(Math.round(size / MB))} МБ`
}

function uploadFailure(status: number, body: string): FileUploadError {
  switch (status) {
    case 410:
      return new FileUploadError(GONE)
    case 413:
      return new FileUploadError(limitText(body))
    case 415:
      return new FileUploadError('Этот тип файла не поддерживается')
    default:
      return new FileUploadError(`Сервер ответил ошибкой ${String(status)}`)
  }
}

function postFile(url: string, file: File, token: string, options: UploadOptions) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const { onProgress, signal } = options
    if (signal?.aborted === true) {
      reject(abortError())
      return
    }
    const xhr = new XMLHttpRequest()
    const onAbort = () => {
      xhr.abort()
    }
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }
    xhr.open('POST', url)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
    })
    xhr.addEventListener('load', () => {
      cleanup()
      resolve({ status: xhr.status, body: xhr.responseText })
    })
    xhr.addEventListener('error', () => {
      cleanup()
      reject(new AskError(UNREACHABLE))
    })
    xhr.addEventListener('abort', () => {
      cleanup()
      reject(abortError())
    })
    signal?.addEventListener('abort', onAbort)
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

/** Posts one file as multipart "file" with the bearer token (renewed once on 401); raw result. */
export async function postMultipart(
  path: string,
  file: File,
  options: UploadOptions = {},
): Promise<{ status: number; body: string }> {
  const url = `${await getBackendUrl()}${path}`
  const token = getAccessToken() ?? (await refreshAccessToken()).accessToken
  const result = await postFile(url, file, token, options)
  if (result.status !== 401) return result
  // The token may have expired in flight: renew once and repeat.
  return postFile(url, file, (await refreshAccessToken()).accessToken, options)
}

/** Uploads one file with the bearer token; XHR because fetch cannot report upload progress. */
export async function uploadFile(file: File, options: UploadOptions = {}): Promise<{ id: string }> {
  const result = await postMultipart('/files', file, options)
  if (result.status < 200 || result.status >= 300) throw uploadFailure(result.status, result.body)
  try {
    return StoredFileSchema.parse(JSON.parse(result.body))
  } catch {
    throw new FileUploadError('Сервер вернул ответ в неожиданном формате')
  }
}

/** Hands a signed relative link (`/…?token=`) to the browser: it saves the file under the given name. */
export async function downloadByLink(url: string, name: string): Promise<void> {
  await chrome.downloads.download({ url: `${await getBackendUrl()}${url}`, filename: name })
}

/** Gets a signed link and lets the browser save the file under its original name. */
export async function downloadFile(id: string, name: string): Promise<void> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await authFetch(
      `${baseUrl}/files/${encodeURIComponent(id)}/download-link`,
      withClientApp({ method: 'POST' }),
    )
  } catch {
    throw new AskError(UNREACHABLE)
  }
  if (response.status === 410) throw new AskError(GONE)
  if (!response.ok) throw new AskError(await errorMessage(response))
  let link: z.infer<typeof DownloadLinkSchema>
  try {
    link = DownloadLinkSchema.parse(await response.json())
  } catch {
    throw new AskError('Сервер вернул ответ в неожиданном формате')
  }
  await downloadByLink(link.url, name)
}
