import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AskError } from './api'
import { clearAccessToken, setAccessToken } from './auth/access-token-store'
import { resetAuthState } from './auth/auth-state'
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  createTask,
  downloadAttachment,
  getTask,
  listTasks,
  searchUsers,
  TaskNotFoundError,
  TaskUserNotFoundError,
  updateTask,
} from './tasks-api'

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
    fetchMock.mockResolvedValue(json({ ...task, attachments: [] }, 201))
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
    fetchMock.mockResolvedValue(json({ ...task, status: 'done', attachments: [] }))
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

describe('downloadAttachment', () => {
  it('returns the blob and the original name from filename*', async () => {
    fetchMock.mockResolvedValue(
      new Response('data', {
        headers: {
          'content-disposition': `attachment; filename="_.pdf"; filename*=UTF-8''%D0%9F%D1%80%D0%B0%D0%B9%D1%81.pdf`,
        },
      }),
    )
    const file = await downloadAttachment('t1', 'a1')
    expect(lastCall().url).toBe('http://api.test/tasks/t1/attachments/a1')
    expect(file.fileName).toBe('Прайс.pdf')
    expect(await file.blob.text()).toBe('data')
  })

  it('falls back to the quoted filename, then to a generic name', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('x', { headers: { 'content-disposition': 'attachment; filename="a.txt"' } }),
    )
    expect((await downloadAttachment('t1', 'a1')).fileName).toBe('a.txt')
    fetchMock.mockResolvedValueOnce(new Response('x'))
    expect((await downloadAttachment('t1', 'a1')).fileName).toBe('attachment')
  })

  it('maps 404 to TaskNotFoundError', async () => {
    fetchMock.mockResolvedValue(json({ message: 'nf' }, 404))
    await expect(downloadAttachment('t1', 'a1')).rejects.toBeInstanceOf(TaskNotFoundError)
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
