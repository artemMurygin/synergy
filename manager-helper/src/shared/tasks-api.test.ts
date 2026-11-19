import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AskError } from './api'
import { clearAccessToken, setAccessToken } from './auth/access-token-store'
import { resetAuthState } from './auth/auth-state'
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  createTask,
  deleteAttachment,
  deleteTask,
  getTask,
  listTasks,
  searchUsers,
  taskAttachmentLink,
  AttachmentLinksUnavailableError,
  TaskNotFoundError,
  TaskUserNotFoundError,
  updateTask,
  uploadAttachment,
} from './tasks-api'
import { postMultipart } from './files-api'

vi.mock('./files-api', () => ({ postMultipart: vi.fn() }))
vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

const user = { id: 'u1', login: 'anna' }
const task = {
  id: 't1',
  title: 'КП',
  description: '',
  status: 'todo',
  deadline: '2026-12-01T09:00:00.000Z',
  creator: user,
  assignee: user,
  watchers: [{ id: 'u2', login: null }],
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:05:00.000Z',
  completedAt: null,
  attachmentCount: 2,
}
const attachment = {
  id: 'a1',
  taskId: 't1',
  originalName: 'Прайс.pdf',
  sizeBytes: 10,
  contentType: 'application/pdf',
  uploadedBy: 'u1',
  createdAt: '2026-11-06T10:00:00.000Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Sender = (url: string, init?: RequestInit) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn<Sender>>

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  return { url: call[0], init: call[1] ?? {} }
}

function bodyText(init: RequestInit): string {
  if (typeof init.body !== 'string') throw new Error('expected a JSON string body')
  return init.body
}

beforeEach(() => {
  fetchMock = vi.fn<Sender>()
  vi.stubGlobal('fetch', fetchMock)
  setAccessToken('tok')
})
afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

describe('listTasks', () => {
  it('sends the filters as query parameters through authFetch and parses the page', async () => {
    fetchMock.mockResolvedValue(json({ items: [task], total: 1, limit: 50, page: 0 }))
    const page = await listTasks({
      status: 'todo',
      assigneeId: 'u1',
      sort: 'deadline',
      order: 'asc',
      limit: 50,
      page: 0,
      search: 'КП',
    })
    const url = new URL(lastCall().url)
    expect(url.origin + url.pathname).toBe('http://api.test/tasks')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'todo',
      assigneeId: 'u1',
      sort: 'deadline',
      order: 'asc',
      limit: '50',
      page: '0',
      search: 'КП',
    })
    expect(new Headers(lastCall().init.headers).get('authorization')).toBe('Bearer tok')
    expect(page).toEqual({ items: [task], total: 1, limit: 50, page: 0 })
  })

  it('omits undefined filters', async () => {
    fetchMock.mockResolvedValue(json({ items: [], total: 0, limit: 20, page: 0 }))
    await listTasks({})
    expect(new URL(lastCall().url).search).toBe('')
  })

  it('rejects a malformed page', async () => {
    fetchMock.mockResolvedValue(json({ items: 'nope', total: 0, limit: 20, page: 0 }))
    await expect(listTasks({})).rejects.toBeInstanceOf(AskError)
  })

  it('rejects a task with an unknown status', async () => {
    fetchMock.mockResolvedValue(
      json({ items: [{ ...task, status: 'archived' }], total: 1, limit: 20, page: 0 }),
    )
    await expect(listTasks({})).rejects.toThrow('неожиданном формате')
  })

  it('rejects a task with a malformed user', async () => {
    fetchMock.mockResolvedValue(
      json({ items: [{ ...task, creator: { id: 1 } }], total: 1, limit: 20, page: 0 }),
    )
    await expect(listTasks({})).rejects.toBeInstanceOf(AskError)
  })

  it('reports an unreachable server', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(listTasks({})).rejects.toThrow('Не удалось связаться с сервером http://api.test')
  })
})

describe('getTask', () => {
  it('requests the task and parses the attachments', async () => {
    fetchMock.mockResolvedValue(json({ ...task, attachments: [attachment] }))
    const details = await getTask('t 1')
    expect(lastCall().url).toBe('http://api.test/tasks/t%201')
    expect(details.attachments).toEqual([attachment])
  })

  it('rejects details without attachments', async () => {
    fetchMock.mockResolvedValue(json(task))
    await expect(getTask('t1')).rejects.toBeInstanceOf(AskError)
  })

  it('maps 404 to TaskNotFoundError', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Task not found' }, 404))
    await expect(getTask('t1')).rejects.toBeInstanceOf(TaskNotFoundError)
  })
})

describe('createTask', () => {
  it('posts the JSON body', async () => {
    // Форма реального ответа backend: без attachments, с attachmentCount.
    fetchMock.mockResolvedValue(json({ ...task, attachmentCount: 0 }, 201))
    const created = await createTask({ title: 'КП', assigneeId: 'u1', deadline: null })
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/tasks')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(bodyText(init))).toEqual({
      title: 'КП',
      assigneeId: 'u1',
      deadline: null,
    })
    expect(created.id).toBe('t1')
  })

  it('maps 422 TASK_USER_NOT_FOUND to TaskUserNotFoundError', async () => {
    fetchMock.mockResolvedValue(json({ code: 'TASK_USER_NOT_FOUND', message: 'No such user' }, 422))
    await expect(createTask({ title: 'x' })).rejects.toBeInstanceOf(TaskUserNotFoundError)
  })
})

describe('updateTask', () => {
  it('patches only the given fields', async () => {
    fetchMock.mockResolvedValue(json({ ...task, status: 'done', attachmentCount: 2 }))
    const updated = await updateTask('t1', { status: 'done' })
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/tasks/t1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(bodyText(init))).toEqual({ status: 'done' })
    expect(updated.status).toBe('done')
  })

  it('maps 404 to TaskNotFoundError', async () => {
    fetchMock.mockResolvedValue(json({ message: 'nf' }, 404))
    await expect(updateTask('t1', { title: 'x' })).rejects.toBeInstanceOf(TaskNotFoundError)
  })

  it('maps 422 TASK_USER_NOT_FOUND to TaskUserNotFoundError', async () => {
    fetchMock.mockResolvedValue(json({ code: 'TASK_USER_NOT_FOUND', message: 'm' }, 422))
    await expect(updateTask('t1', { assigneeId: 'x' })).rejects.toBeInstanceOf(
      TaskUserNotFoundError,
    )
  })

  it('maps 422 TASK_ATTACHMENT_LIMIT and 413 to attachment errors', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 'TASK_ATTACHMENT_LIMIT', message: 'm' }, 422))
    await expect(updateTask('t1', { title: 'x' })).rejects.toBeInstanceOf(AttachmentLimitError)
    fetchMock.mockResolvedValueOnce(json({ message: 'big' }, 413))
    await expect(updateTask('t1', { title: 'x' })).rejects.toBeInstanceOf(AttachmentTooLargeError)
  })

  it('keeps the server message for other 422 errors as a plain AskError', async () => {
    fetchMock.mockResolvedValue(json({ code: 'OTHER', message: 'Некорректно' }, 422))
    const error = await updateTask('t1', { title: 'x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AskError)
    expect(error).not.toBeInstanceOf(TaskUserNotFoundError)
    expect(error).toHaveProperty('message', 'Некорректно')
  })
})

describe('taskAttachmentLink', () => {
  it('posts to download-link and returns the relative url', async () => {
    fetchMock.mockResolvedValue(
      json({ url: '/tasks/t1/attachments/a1/content?token=x', expiresAt: '2026-11-19T10:00:00Z' }),
    )
    const link = await taskAttachmentLink('t1', 'a1')
    expect(lastCall().url).toBe('http://api.test/tasks/t1/attachments/a1/download-link')
    expect(lastCall().init.method).toBe('POST')
    expect(link.url).toBe('/tasks/t1/attachments/a1/content?token=x')
  })

  it('maps 404 to a readable TaskNotFoundError', async () => {
    fetchMock.mockResolvedValue(json({ message: 'nf' }, 404))
    const error = await taskAttachmentLink('t1', 'a1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TaskNotFoundError)
    expect(error).toHaveProperty('message', 'Вложение не найдено: возможно, его удалили')
  })

  it('maps 503 to a readable LinksUnavailableError', async () => {
    fetchMock.mockResolvedValue(
      json({ message: 'x', code: 'TASK_ATTACHMENT_LINKS_UNAVAILABLE' }, 503),
    )
    const error = await taskAttachmentLink('t1', 'a1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AttachmentLinksUnavailableError)
    expect(error).toHaveProperty('message', 'Скачивание вложений сейчас недоступно на сервере')
  })

  it('rejects an unexpected body', async () => {
    fetchMock.mockResolvedValue(json({ nope: 1 }))
    await expect(taskAttachmentLink('t1', 'a1')).rejects.toThrow('неожиданном формате')
  })
})

describe('searchUsers', () => {
  it('queries GET /users with search and limit and parses the page', async () => {
    fetchMock.mockResolvedValue(json({ items: [user], total: 1, limit: 20, page: 0 }))
    const page = await searchUsers('an', 20)
    const url = new URL(lastCall().url)
    expect(url.pathname).toBe('/users')
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: 'an', limit: '20' })
    expect(page.items).toEqual([user])
  })

  it('omits an empty search', async () => {
    fetchMock.mockResolvedValue(json({ items: [], total: 0, limit: 20, page: 0 }))
    await searchUsers('')
    expect(new URL(lastCall().url).searchParams.has('search')).toBe(false)
  })

  it('rejects users without a login', async () => {
    fetchMock.mockResolvedValue(
      json({ items: [{ id: 'u1', login: null }], total: 1, limit: 20, page: 0 }),
    )
    await expect(searchUsers('')).rejects.toBeInstanceOf(AskError)
  })
})

describe('uploadAttachment', () => {
  const file = new File(['x'], 'Прайс.pdf')

  it('posts the file to the task attachments and parses the attachment', async () => {
    vi.mocked(postMultipart).mockResolvedValue({ status: 201, body: JSON.stringify(attachment) })
    const onProgress = vi.fn()
    const result = await uploadAttachment('t 1', file, { onProgress })
    expect(postMultipart).toHaveBeenCalledWith('/tasks/t%201/attachments', file, { onProgress })
    expect(result.id).toBe('a1')
  })

  it('maps 413 to AttachmentTooLargeError', async () => {
    vi.mocked(postMultipart).mockResolvedValue({
      status: 413,
      body: JSON.stringify({ message: 'File is larger than 20971520 bytes' }),
    })
    await expect(uploadAttachment('t1', file)).rejects.toBeInstanceOf(AttachmentTooLargeError)
  })

  it('maps 422 TASK_ATTACHMENT_LIMIT to AttachmentLimitError', async () => {
    vi.mocked(postMultipart).mockResolvedValue({
      status: 422,
      body: JSON.stringify({ code: 'TASK_ATTACHMENT_LIMIT', message: 'limit' }),
    })
    await expect(uploadAttachment('t1', file)).rejects.toBeInstanceOf(AttachmentLimitError)
  })

  it('maps 404 to TaskNotFoundError and other statuses to AskError', async () => {
    vi.mocked(postMultipart).mockResolvedValue({ status: 404, body: '{}' })
    await expect(uploadAttachment('t1', file)).rejects.toBeInstanceOf(TaskNotFoundError)
    vi.mocked(postMultipart).mockResolvedValue({ status: 500, body: 'boom' })
    await expect(uploadAttachment('t1', file)).rejects.toBeInstanceOf(AskError)
  })

  it('rejects an unexpected response body', async () => {
    vi.mocked(postMultipart).mockResolvedValue({ status: 201, body: '{"x":1}' })
    await expect(uploadAttachment('t1', file)).rejects.toThrow('неожиданном формате')
  })
})

describe('deleteAttachment and deleteTask', () => {
  beforeEach(() => {
    setAccessToken('tok')
    fetchMock = vi.fn<Sender>().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('deletes an attachment', async () => {
    await deleteAttachment('t1', 'a1')
    expect(lastCall().url).toBe('http://api.test/tasks/t1/attachments/a1')
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('deletes a task and maps 404', async () => {
    await deleteTask('t1')
    expect(lastCall().url).toBe('http://api.test/tasks/t1')
    expect(lastCall().init.method).toBe('DELETE')
    fetchMock.mockResolvedValue(json({ message: 'no' }, 404))
    await expect(deleteTask('t1')).rejects.toBeInstanceOf(TaskNotFoundError)
  })
})
