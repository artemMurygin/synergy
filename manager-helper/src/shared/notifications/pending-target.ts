import { z } from 'zod'

const PENDING_TARGET_KEY = 'pendingTarget'

const pendingTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), taskId: z.string().min(1) }),
  z.object({ kind: z.literal('request'), requestId: z.string().min(1) }),
  z.object({ kind: z.literal('chat'), chatId: z.string().min(1) }),
  z.object({ kind: z.literal('notifications') }),
])

export type PendingTarget = z.infer<typeof pendingTargetSchema>

export async function setPendingTarget(target: PendingTarget): Promise<void> {
  await chrome.storage.session.set({ [PENDING_TARGET_KEY]: target })
}

export async function takePendingTarget(): Promise<PendingTarget | null> {
  try {
    const stored = await chrome.storage.session.get(PENDING_TARGET_KEY)
    const value: unknown = stored[PENDING_TARGET_KEY]
    if (value === undefined) return null
    await chrome.storage.session.remove(PENDING_TARGET_KEY)
    const parsed = pendingTargetSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function onPendingTargetChanged(listener: () => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'session') return
    const change = changes[PENDING_TARGET_KEY]
    if (change?.newValue !== undefined) listener()
  }
  chrome.storage.onChanged.addListener(handleChange)
  return () => {
    chrome.storage.onChanged.removeListener(handleChange)
  }
}
