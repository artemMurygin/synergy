import { BackendError } from '@/lib/backend/errors'
import type { TaskFormErrors } from './TaskForm'

const FIELD_OF_PATH: Record<string, keyof TaskFormErrors> = {
  title: 'title',
  description: 'description',
  deadline: 'deadline',
  assigneeId: 'assignee',
  watcherIds: 'watchers'
}

/**
 * Splits a 400 body from the server (zod `prettifyError`: an error line, then `  → at <path>`)
 * into per-field messages. Returns null when no line names a known field.
 */
export function fieldErrorsFromError(error: unknown): TaskFormErrors | null {
  if (!(error instanceof BackendError)) return null
  const result: TaskFormErrors = {}
  let text = ''
  for (const line of error.message.split('\n')) {
    const at = /^\s*→ at ([A-Za-z]+)/.exec(line)
    if (at) {
      const field = FIELD_OF_PATH[at[1] ?? '']
      if (field && text) result[field] ??= text
      text = ''
    } else if (line.trim() !== '') {
      text = line.replace(/^\s*✖\s*/, '').trim()
    }
  }
  return Object.keys(result).length > 0 ? result : null
}
