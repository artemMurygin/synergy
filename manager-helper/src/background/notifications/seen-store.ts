import { z } from 'zod'
import { notificationTargetSchema } from '@/shared/notifications/notifications-schema'
import type { NotificationTarget } from '@/shared/notifications/notifications-schema'

const SEEN_STORAGE_KEY = 'notificationsSeen'
const MAX_SHOWN_ENTRIES = 200

const shownEntrySchema = z.object({ id: z.string(), target: notificationTargetSchema.nullable() })

const seenStateSchema = z.object({
  userId: z.string(),
  lastSeenCreatedAt: z.string().nullable(),
  shown: z.array(shownEntrySchema),
})

type SeenState = z.infer<typeof seenStateSchema>
export type ShownEntry = z.infer<typeof shownEntrySchema>

export interface SeenStore {
  getLastSeenCreatedAt(): Promise<string | null>
  advanceLastSeen(createdAt: string): Promise<void>
  hasShown(notificationId: string): Promise<boolean>
  markShown(entries: readonly ShownEntry[]): Promise<void>
  findTarget(notificationId: string): Promise<NotificationTarget | null>
}

function emptyState(userId: string): SeenState {
  return { userId, lastSeenCreatedAt: null, shown: [] }
}

export function isCreatedAfter(createdAt: string, reference: string): boolean {
  return Date.parse(createdAt) > Date.parse(reference)
}

export function createSeenStore(getUserId: () => string | null): SeenStore {
  let queue: Promise<unknown> = Promise.resolve()

  function serialized<TResult>(work: () => Promise<TResult>): Promise<TResult> {
    const result = queue.then(work, work)
    queue = result.catch(() => undefined)
    return result
  }

  async function read(): Promise<SeenState | null> {
    const userId = getUserId()
    if (userId === null) return null
    const stored = await chrome.storage.local.get(SEEN_STORAGE_KEY)
    const parsed = seenStateSchema.safeParse(stored[SEEN_STORAGE_KEY])
    return parsed.success && parsed.data.userId === userId ? parsed.data : emptyState(userId)
  }

  async function update(change: (state: SeenState) => SeenState): Promise<void> {
    await serialized(async () => {
      const state = await read()
      if (state === null) return
      await chrome.storage.local.set({ [SEEN_STORAGE_KEY]: change(state) })
    })
  }

  return {
    async getLastSeenCreatedAt() {
      return (await serialized(read))?.lastSeenCreatedAt ?? null
    },
    advanceLastSeen(createdAt) {
      return update((state) =>
        state.lastSeenCreatedAt !== null && !isCreatedAfter(createdAt, state.lastSeenCreatedAt)
          ? state
          : { ...state, lastSeenCreatedAt: createdAt },
      )
    },
    async hasShown(notificationId) {
      const state = await serialized(read)
      return state?.shown.some((entry) => entry.id === notificationId) ?? false
    },
    markShown(entries) {
      const ids = new Set(entries.map((entry) => entry.id))
      return update((state) => ({
        ...state,
        shown: [...state.shown.filter((entry) => !ids.has(entry.id)), ...entries].slice(
          -MAX_SHOWN_ENTRIES,
        ),
      }))
    },
    async findTarget(notificationId) {
      const state = await serialized(read)
      return state?.shown.find((entry) => entry.id === notificationId)?.target ?? null
    },
  }
}
