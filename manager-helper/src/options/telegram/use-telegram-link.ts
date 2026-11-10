import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthStatus } from '@/shared/auth'
import {
  TelegramNotConfiguredError,
  TelegramNotLinkedError,
  TelegramUnauthorizedError,
  getTelegramLink,
  issueTelegramLinkToken,
  setTelegramNotifications,
  unlinkTelegram,
} from '@/shared/telegram-api'
import { botUsernameFromUrl } from '@/shared/telegram-schema'
import type { TelegramLinkStatus } from '@/shared/telegram-schema'

export const LINK_POLL_INTERVAL_MS = 2000
const COUNTDOWN_TICK_MS = 1000

export type TelegramLinkState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }
  | { kind: 'load-error'; message: string }
  | { kind: 'idle' }
  | { kind: 'issuing' }
  | { kind: 'waiting'; url: string; botUsername: string | null; expiresAt: string }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }
  | { kind: 'not-configured' }
  | {
      kind: 'linked'
      status: TelegramLinkStatus
      isToggling: boolean
      toggleError: string | null
      unlinkError: string | null
    }
  | { kind: 'unlinking'; status: TelegramLinkStatus }

export interface TelegramLink {
  state: TelegramLinkState
  remainingMs: number
  connect: () => Promise<void>
  reopenLink: () => void
  cancel: () => void
  toggleNotifications: (isEnabled: boolean) => Promise<void>
  unlink: () => Promise<void>
  reload: () => void
}

const LOADING: TelegramLinkState = { kind: 'loading' }
const SIGNED_OUT: TelegramLinkState = { kind: 'signed-out' }

function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'Неизвестная ошибка'
}

function linkedState(
  status: TelegramLinkStatus,
  errors: { toggleError?: string; unlinkError?: string } = {},
): TelegramLinkState {
  return {
    kind: 'linked',
    status,
    isToggling: false,
    toggleError: errors.toggleError ?? null,
    unlinkError: errors.unlinkError ?? null,
  }
}

function stateFromStatus(status: TelegramLinkStatus): TelegramLinkState {
  if (!status.isAvailable) return { kind: 'unavailable' }
  return status.isLinked ? linkedState(status) : { kind: 'idle' }
}

function ignoreFailure(): void {
  return undefined
}

function openLinkTab(url: string): void {
  chrome.tabs.create({ url }).then(ignoreFailure, ignoreFailure)
}

export function useTelegramLink(authStatus: AuthStatus): TelegramLink {
  const [state, setState] = useState<TelegramLinkState>(LOADING)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [reloadCount, setReloadCount] = useState(0)
  const epoch = useRef(0)

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    const id = ++epoch.current
    let isActive = true
    const isCurrent = () => isActive && id === epoch.current
    getTelegramLink().then(
      (status) => {
        if (isCurrent()) setState(stateFromStatus(status))
      },
      (error: unknown) => {
        if (!isCurrent()) return
        setState(
          error instanceof TelegramUnauthorizedError
            ? SIGNED_OUT
            : { kind: 'load-error', message: messageOf(error) },
        )
      },
    )
    return () => {
      isActive = false
      setState(LOADING)
    }
  }, [authStatus, reloadCount])

  const waitingExpiresAt = state.kind === 'waiting' ? state.expiresAt : null

  useEffect(() => {
    if (waitingExpiresAt === null) return
    const expiresAtMs = Date.parse(waitingExpiresAt)
    const id = epoch.current
    const isExpired = () => Date.now() >= expiresAtMs
    const countdown = setInterval(() => {
      setNowMs(Date.now())
      if (isExpired() && id === epoch.current) {
        epoch.current++
        setState({ kind: 'expired' })
      }
    }, COUNTDOWN_TICK_MS)
    const poll = setInterval(() => {
      if (isExpired()) return
      getTelegramLink().then((status) => {
        if (id !== epoch.current || (status.isAvailable && !status.isLinked)) return
        epoch.current++
        setState(stateFromStatus(status))
      }, ignoreFailure)
    }, LINK_POLL_INTERVAL_MS)
    return () => {
      clearInterval(countdown)
      clearInterval(poll)
    }
  }, [waitingExpiresAt])

  const connect = useCallback(async () => {
    const id = ++epoch.current
    setState({ kind: 'issuing' })
    try {
      const token = await issueTelegramLinkToken()
      if (id !== epoch.current) return
      setNowMs(Date.now())
      setState({
        kind: 'waiting',
        url: token.url,
        botUsername: botUsernameFromUrl(token.url),
        expiresAt: token.expiresAt,
      })
      openLinkTab(token.url)
    } catch (error: unknown) {
      if (id !== epoch.current) return
      if (error instanceof TelegramNotConfiguredError) setState({ kind: 'not-configured' })
      else if (error instanceof TelegramUnauthorizedError) setState(SIGNED_OUT)
      else setState({ kind: 'error', message: messageOf(error) })
    }
  }, [])

  const reopenLink = useCallback(() => {
    if (state.kind === 'waiting') openLinkTab(state.url)
  }, [state])

  const cancel = useCallback(() => {
    epoch.current++
    setState({ kind: 'idle' })
  }, [])

  const toggleNotifications = useCallback(
    async (isEnabled: boolean) => {
      if (state.kind !== 'linked') return
      const previous = state.status
      const id = ++epoch.current
      setState({
        kind: 'linked',
        status: { ...previous, notificationsEnabled: isEnabled },
        isToggling: true,
        toggleError: null,
        unlinkError: null,
      })
      try {
        const status = await setTelegramNotifications(isEnabled)
        if (id === epoch.current) setState(stateFromStatus(status))
      } catch (error: unknown) {
        if (id !== epoch.current) return
        if (error instanceof TelegramNotLinkedError) setState({ kind: 'idle' })
        else if (error instanceof TelegramUnauthorizedError) setState(SIGNED_OUT)
        else setState(linkedState(previous, { toggleError: messageOf(error) }))
      }
    },
    [state],
  )

  const unlink = useCallback(async () => {
    if (state.kind !== 'linked') return
    const current = state.status
    const id = ++epoch.current
    setState({ kind: 'unlinking', status: current })
    try {
      await unlinkTelegram()
      if (id === epoch.current) setState({ kind: 'idle' })
    } catch (error: unknown) {
      if (id !== epoch.current) return
      if (error instanceof TelegramUnauthorizedError) setState(SIGNED_OUT)
      else setState(linkedState(current, { unlinkError: messageOf(error) }))
    }
  }, [state])

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1)
  }, [])

  const visibleState: TelegramLinkState =
    authStatus === 'authenticated' ? state : authStatus === 'restoring' ? LOADING : SIGNED_OUT
  const remainingMs =
    visibleState.kind === 'waiting' ? Math.max(0, Date.parse(visibleState.expiresAt) - nowMs) : 0

  return {
    state: visibleState,
    remainingMs,
    connect,
    reopenLink,
    cancel,
    toggleNotifications,
    unlink,
    reload,
  }
}
