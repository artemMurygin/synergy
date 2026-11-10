import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { NotificationDto } from '@/shared/notifications/notifications-schema'
import { BellIcon, CheckCheckIcon, CloseIcon, CloudOffIcon, LoaderCircleIcon } from '../icons'
import { isWidePanel } from '../panel-layout'
import { useViewportSize } from '../use-viewport-size'
import { NotificationItem } from './NotificationItem'
import type { LoadMoreStatus, NotificationsStatus } from './use-notifications'

interface Props {
  items: NotificationDto[]
  unreadCount: number
  status: NotificationsStatus
  isInitialLoad: boolean
  hasMore: boolean
  loadMoreStatus: LoadMoreStatus
  now?: Date
  anchorRef?: RefObject<HTMLElement | null>
  onOpen: (notification: NotificationDto) => void
  onReadAll: () => void
  onLoadMore: () => void
  onRetry: () => void
  onClose: () => void
}

const SKELETON_ROWS = 7

const outlineButton =
  'flex h-10 items-center rounded-full border border-brand-red bg-white px-[18px] text-sm font-medium text-brand-red hover:bg-brand-red-soft'

function Skeleton() {
  return (
    <div role="status" aria-label="Загрузка уведомлений" aria-busy="true">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="flex gap-3 border-b border-line px-4 py-3.5">
          <span className="size-8 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-3 w-[150px] max-w-full animate-pulse rounded-md bg-surface-sunken" />
            <span className="h-2.5 w-full animate-pulse rounded-[5px] bg-surface-sunken" />
            <span className="h-2.5 w-[170px] max-w-full animate-pulse rounded-[5px] bg-surface-sunken" />
          </span>
        </div>
      ))}
    </div>
  )
}

function Notice({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode
  title: string
  text: string
  children?: ReactNode
}) {
  return (
    <div className="m-auto flex max-w-[316px] flex-col items-center px-4 py-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-surface-sunken text-ink-60">
        {icon}
      </span>
      <p className="mt-3 font-heading text-lg font-semibold text-ink">{title}</p>
      <p className="mt-3 max-w-[280px] text-sm leading-[1.4] text-ink-60">{text}</p>
      {children !== undefined && <div className="mt-3">{children}</div>}
    </div>
  )
}

function LoadMoreRow({ status, onLoadMore }: { status: LoadMoreStatus; onLoadMore: () => void }) {
  if (status === 'loading') {
    return (
      <div className="flex h-11 items-center justify-center gap-2 text-[13px] font-medium text-ink-60">
        <span className="animate-spin">
          <LoaderCircleIcon />
        </span>
        Загружаем ещё…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex h-11 items-center justify-center gap-3 text-[13px] font-medium text-ink-60">
        Не удалось загрузить ещё
        <button
          type="button"
          className="font-semibold text-brand-red hover:underline"
          onClick={onLoadMore}
        >
          Повторить
        </button>
      </div>
    )
  }
  return (
    <div className="flex justify-center px-4 py-3">
      <button
        type="button"
        className="rounded-full border border-field-line px-4 py-2 text-[13px] font-semibold text-ink-80 hover:bg-surface-alt"
        onClick={onLoadMore}
      >
        Показать ещё
      </button>
    </div>
  )
}

export function NotificationsOverlay(props: Props) {
  const { items, unreadCount, status, isInitialLoad, anchorRef, onClose } = props
  const { widthPx } = useViewportSize()
  const isDropdown = isWidePanel(widthPx)
  const rootRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const now = props.now ?? new Date()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isDropdown) return
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) === true) return
      if (anchorRef?.current?.contains(target) === true) return
      onCloseRef.current()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isDropdown, anchorRef])

  const isReadAllDisabled = unreadCount === 0 || isInitialLoad

  let body: ReactNode
  if (isInitialLoad) {
    body = <Skeleton />
  } else if (status === 'error' && items.length === 0) {
    body = (
      <div role="alert" className="flex flex-1 flex-col">
        <Notice
          icon={<CloudOffIcon size={28} />}
          title="Не удалось загрузить уведомления"
          text="Сервер недоступен. Проверьте подключение и повторите попытку"
        >
          <button type="button" className={outlineButton} onClick={props.onRetry}>
            Повторить
          </button>
        </Notice>
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <Notice
        icon={<BellIcon size={28} />}
        title="Уведомлений пока нет"
        text="Здесь появятся задачи, которые вам назначат, и другие события"
      />
    )
  } else {
    body = (
      <>
        <ul aria-label="Список уведомлений">
          {items.map((notification) => (
            <li key={notification.id}>
              <NotificationItem
                notification={notification}
                now={now}
                timeMode={isDropdown ? 'full' : 'short'}
                onOpen={props.onOpen}
              />
            </li>
          ))}
        </ul>
        {props.hasMore && (
          <LoadMoreRow status={props.loadMoreStatus} onLoadMore={props.onLoadMore} />
        )}
      </>
    )
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Уведомления"
      tabIndex={-1}
      data-layout={isDropdown ? 'dropdown' : 'panel'}
      className={`z-30 flex flex-col bg-white outline-none ${
        isDropdown
          ? 'absolute top-[calc(100%-4px)] right-14 max-h-[520px] w-100 overflow-hidden rounded-2xl border border-line shadow-[0_12px_32px_#0000001f]'
          : 'absolute inset-x-0 top-[calc(100%+1px)] h-[calc(100vh-100%-1px)]'
      }`}
    >
      <div
        className={`flex shrink-0 items-center gap-2 border-b border-line pr-2 pl-4 ${
          isDropdown ? 'h-[52px]' : 'h-12'
        }`}
      >
        <h2 className="font-heading text-base font-semibold text-ink">Уведомления</h2>
        {unreadCount > 0 && (
          <span
            data-testid="unread-count"
            className="flex items-center gap-[5px] rounded-full bg-brand-red-soft px-2 py-[3px] text-[11px] leading-[13px] font-semibold text-brand-red"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-red" />
            {String(unreadCount)}
            <span className={isDropdown ? undefined : 'sr-only'}> новых</span>
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          disabled={isReadAllDisabled}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-ink-80 hover:bg-surface-alt disabled:opacity-45 disabled:hover:bg-transparent"
          onClick={props.onReadAll}
        >
          <span className="text-ink-60">
            <CheckCheckIcon />
          </span>
          Прочитать все
        </button>
        {!isDropdown && (
          <button
            type="button"
            aria-label="Закрыть уведомления"
            className="flex size-8 items-center justify-center rounded-lg text-ink hover:bg-surface-alt"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">{body}</div>
    </div>
  )
}
