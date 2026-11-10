import { create } from 'zustand'
import type { Notification } from '@/lib/backend/notifications.schema'

export const MAX_VISIBLE_TOASTS = 3
export const TOAST_DURATION_MS = 6_000

interface ToastTimer {
  handle: ReturnType<typeof setTimeout> | null
  remainingMs: number
  startedAt: number
}

interface NotificationsState {
  toasts: Notification[]
  notice: string | null
  showToast: (notification: Notification) => void
  dismiss: (id: string) => void
  pause: (id: string) => void
  resume: (id: string) => void
  showNotice: (notice: string) => void
  clearNotice: () => void
  reset: () => void
}

const timers = new Map<string, ToastTimer>()
const shownIds = new Set<string>()

function stopTimer(id: string): void {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
}

export const useNotificationsStore = create<NotificationsState>((set, get) => {
  const startTimer = (id: string, durationMs: number): void => {
    timers.set(id, {
      handle: setTimeout(() => get().dismiss(id), durationMs),
      remainingMs: durationMs,
      startedAt: Date.now()
    })
  }

  return {
    toasts: [],
    notice: null,
    showToast: (notification) => {
      if (shownIds.has(notification.id)) return
      shownIds.add(notification.id)
      const visible = [...get().toasts, notification]
      const overflow = visible.slice(0, Math.max(0, visible.length - MAX_VISIBLE_TOASTS))
      for (const dropped of overflow) stopTimer(dropped.id)
      set({ toasts: visible.slice(overflow.length) })
      startTimer(notification.id, TOAST_DURATION_MS)
    },
    dismiss: (id) => {
      stopTimer(id)
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    },
    pause: (id) => {
      const timer = timers.get(id)
      if (!timer?.handle) return
      clearTimeout(timer.handle)
      timers.set(id, {
        handle: null,
        remainingMs: Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt)),
        startedAt: timer.startedAt
      })
    },
    resume: (id) => {
      const timer = timers.get(id)
      if (timer === undefined || timer.handle !== null) return
      startTimer(id, timer.remainingMs)
    },
    showNotice: (notice) => set({ notice }),
    clearNotice: () => set({ notice: null }),
    reset: () => {
      for (const id of [...timers.keys()]) stopTimer(id)
      shownIds.clear()
      set({ toasts: [], notice: null })
    }
  }
})
