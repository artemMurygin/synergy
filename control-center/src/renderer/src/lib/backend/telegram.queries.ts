import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import * as telegramApi from './telegram.api'
import type { TelegramLinkStatus, TelegramLinkToken } from './telegram.schema'

export const TELEGRAM_LINK_KEY = ['telegram', 'link'] as const

export interface TelegramLinkQueryOptions {
  refetchInterval?: number | false
}

export const telegramLinkQuery = (options: TelegramLinkQueryOptions = {}) =>
  queryOptions({
    queryKey: TELEGRAM_LINK_KEY,
    queryFn: () => telegramApi.getTelegramLink(),
    refetchInterval: options.refetchInterval
  })

export function useIssueTelegramLinkToken() {
  return useMutation<TelegramLinkToken>({
    mutationFn: () => telegramApi.issueTelegramLinkToken()
  })
}

interface StatusSnapshot {
  previousStatus: TelegramLinkStatus | undefined
}

export function useSetTelegramNotifications() {
  const queryClient = useQueryClient()
  return useMutation<TelegramLinkStatus, Error, boolean, StatusSnapshot>({
    mutationFn: (isEnabled) => telegramApi.setTelegramNotifications(isEnabled),
    onMutate: async (isEnabled) => {
      await queryClient.cancelQueries({ queryKey: TELEGRAM_LINK_KEY })
      const previousStatus = queryClient.getQueryData<TelegramLinkStatus>(TELEGRAM_LINK_KEY)
      if (previousStatus !== undefined) {
        queryClient.setQueryData<TelegramLinkStatus>(TELEGRAM_LINK_KEY, {
          ...previousStatus,
          notificationsEnabled: isEnabled
        })
      }
      return { previousStatus }
    },
    onError: (_error, _isEnabled, snapshot) => {
      if (snapshot?.previousStatus !== undefined) {
        queryClient.setQueryData(TELEGRAM_LINK_KEY, snapshot.previousStatus)
      }
    },
    onSuccess: (status) => {
      queryClient.setQueryData(TELEGRAM_LINK_KEY, status)
    }
  })
}

export function useUnlinkTelegram() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => telegramApi.unlinkTelegram(),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: TELEGRAM_LINK_KEY })
      const previousStatus = queryClient.getQueryData<TelegramLinkStatus>(TELEGRAM_LINK_KEY)
      if (previousStatus !== undefined) {
        queryClient.setQueryData<TelegramLinkStatus>(TELEGRAM_LINK_KEY, {
          isAvailable: previousStatus.isAvailable,
          isLinked: false
        })
      }
      await queryClient.invalidateQueries({ queryKey: TELEGRAM_LINK_KEY })
    }
  })
}
