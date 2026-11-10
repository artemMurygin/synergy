import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TelegramNotConfiguredError } from '@/lib/backend/errors'
import {
  telegramLinkQuery,
  useIssueTelegramLinkToken,
  useSetTelegramNotifications,
  useUnlinkTelegram
} from '@/lib/backend/telegram.queries'
import { telegramBotUsernameFromUrl, type TelegramLinkStatus } from '@/lib/backend/telegram.schema'

export const TELEGRAM_LINK_POLL_INTERVAL_MS = 2000
const COUNTDOWN_TICK_MS = 1000
const LINK_WINDOW_TARGET = '_blank'
const LINK_WINDOW_FEATURES = 'noopener,noreferrer'
const UNKNOWN_ERROR_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз.'

export type TelegramLinkFlowState =
  | 'loading'
  | 'idle'
  | 'issuing'
  | 'waiting'
  | 'expired'
  | 'error'
  | 'not-configured'
  | 'linked'
  | 'unlinking'

export interface TelegramLinkFlow {
  state: TelegramLinkFlowState
  status: TelegramLinkStatus | undefined
  isInitialLoad: boolean
  isRefreshing: boolean
  botUsername: string | null
  expiresAt: string | null
  remainingMs: number
  errorMessage: string | null
  toggleErrorMessage: string | null
  unlinkErrorMessage: string | null
  connect: () => void
  reopenLink: () => void
  cancel: () => void
  toggleNotifications: (isEnabled: boolean) => void
  unlink: () => void
}

type Phase =
  | { name: 'idle' }
  | { name: 'issuing' }
  | { name: 'waiting'; url: string; expiresAt: string; expiresAtMs: number }
  | { name: 'expired' }
  | { name: 'error'; message: string }
  | { name: 'not-configured' }

const IDLE: Phase = { name: 'idle' }

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message.length > 0 ? error.message : UNKNOWN_ERROR_MESSAGE

function openLink(url: string): void {
  window.open(url, LINK_WINDOW_TARGET, LINK_WINDOW_FEATURES)
}

function deriveState(
  phase: Phase,
  remainingMs: number,
  status: TelegramLinkStatus | undefined,
  hasStatusError: boolean,
  isUnlinking: boolean
): TelegramLinkFlowState {
  if (isUnlinking) return 'unlinking'
  if (status?.isLinked === true) return 'linked'
  if (phase.name === 'waiting') return remainingMs > 0 ? 'waiting' : 'expired'
  if (phase.name !== 'idle') return phase.name
  if (status === undefined) return hasStatusError ? 'error' : 'loading'
  return status.isAvailable ? 'idle' : 'not-configured'
}

export function useTelegramLinkFlow(): TelegramLinkFlow {
  const [phase, setPhase] = useState<Phase>(IDLE)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const attemptRef = useRef(0)

  const isWaiting = phase.name === 'waiting'
  const remainingMs = phase.name === 'waiting' ? Math.max(0, phase.expiresAtMs - nowMs) : 0
  const isPolling = isWaiting && remainingMs > 0

  const statusQuery = useQuery(
    telegramLinkQuery({ refetchInterval: isPolling ? TELEGRAM_LINK_POLL_INTERVAL_MS : false })
  )
  const { mutateAsync: issueToken } = useIssueTelegramLinkToken()
  const notificationsMutation = useSetTelegramNotifications()
  const unlinkMutation = useUnlinkTelegram()

  const status = statusQuery.data
  const isLinked = status?.isLinked === true

  useEffect(() => {
    if (!isWaiting) return
    const timer = setInterval(() => setNowMs(Date.now()), COUNTDOWN_TICK_MS)
    return () => clearInterval(timer)
  }, [isWaiting])

  useEffect(() => {
    if (isWaiting && remainingMs === 0) setPhase({ name: 'expired' })
  }, [isWaiting, remainingMs])

  useEffect(() => {
    if (!isLinked) return
    attemptRef.current += 1
    setPhase(IDLE)
  }, [isLinked])

  const connect = useCallback(() => {
    attemptRef.current += 1
    const attempt = attemptRef.current
    setPhase({ name: 'issuing' })
    const issue = async (): Promise<void> => {
      try {
        const token = await issueToken()
        if (attempt !== attemptRef.current) return
        openLink(token.url)
        setNowMs(Date.now())
        setPhase({ name: 'waiting', url: token.url, expiresAt: token.expiresAt, expiresAtMs: Date.parse(token.expiresAt) })
      } catch (error: unknown) {
        if (attempt !== attemptRef.current) return
        setPhase(
          error instanceof TelegramNotConfiguredError
            ? { name: 'not-configured' }
            : { name: 'error', message: messageOf(error) }
        )
      }
    }
    void issue()
  }, [issueToken])

  const reopenLink = useCallback(() => {
    if (phase.name === 'waiting') openLink(phase.url)
  }, [phase])

  const cancel = useCallback(() => {
    attemptRef.current += 1
    setPhase(IDLE)
  }, [])

  const { mutate: setNotifications } = notificationsMutation
  const toggleNotifications = useCallback(
    (isEnabled: boolean) => setNotifications(isEnabled),
    [setNotifications]
  )

  const { mutate: unlinkAccount } = unlinkMutation
  const unlink = useCallback(() => unlinkAccount(), [unlinkAccount])

  const state = deriveState(phase, remainingMs, status, statusQuery.isError, unlinkMutation.isPending)
  const statusErrorMessage = status === undefined && statusQuery.isError ? messageOf(statusQuery.error) : null

  return {
    state,
    status,
    isInitialLoad: statusQuery.isPending,
    isRefreshing: statusQuery.isFetching && status !== undefined,
    botUsername: state === 'waiting' && phase.name === 'waiting' ? telegramBotUsernameFromUrl(phase.url) : null,
    expiresAt: phase.name === 'waiting' ? phase.expiresAt : null,
    remainingMs,
    errorMessage: phase.name === 'error' ? phase.message : statusErrorMessage,
    toggleErrorMessage: notificationsMutation.error === null ? null : messageOf(notificationsMutation.error),
    unlinkErrorMessage: unlinkMutation.error === null ? null : messageOf(unlinkMutation.error),
    connect,
    reopenLink,
    cancel,
    toggleNotifications,
    unlink
  }
}
