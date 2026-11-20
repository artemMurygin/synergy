import { Fragment, type ReactNode } from 'react'
import { Bell, CheckCheck, CloudOff, RefreshCw, Loader, X } from '../icons'
import { Skeleton } from '../primitives/Skeleton'
import { NotificationItem, type NotificationView } from './NotificationItem'

export type { NotificationView } from './NotificationItem'

export type NotificationsConnection = 'online' | 'reconnecting'

export type NotificationsListState = 'loading' | 'empty' | 'error' | 'ready'

export type NotificationsListProps = {
  items: NotificationView[]
  state: NotificationsListState
  unreadCount?: number
  /** `reconnecting` — над списком баннер, прежние элементы остаются. */
  connection?: NotificationsConnection
  hasMore?: boolean
  loadingMore?: boolean
  onOpen: (item: NotificationView) => void
  onReadAll: () => void
  onLoadMore: () => void
  onRetry: () => void
  onClose?: () => void
  /** Шапку рисует контейнер (верхняя панель mobile). */
  hideHeader?: boolean
}

function SkeletonRows() {
  return (
    <div role="status" aria-label="Загрузка уведомлений" className="flex flex-col gap-0.5 p-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 p-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-full bg-surface-alt" />
            <Skeleton className="h-2.5 w-28 bg-surface-alt" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Message({ tone, title, text, action }: { tone: 'error' | 'empty'; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 pb-16 text-center">
      <span
        className={
          tone === 'error'
            ? 'flex size-14 items-center justify-center rounded-full bg-brand-red-soft text-brand-red'
            : 'flex size-14 items-center justify-center rounded-full bg-surface-alt text-ink-40'
        }
      >
        {tone === 'error' ? <CloudOff size={24} /> : <Bell size={24} />}
      </span>
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="text-[13px] text-ink-60">{text}</p>
      {action}
    </div>
  )
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="mt-1 inline-flex h-10 items-center gap-2 rounded-[20px] bg-brand-red px-[18px] text-sm font-semibold text-white outline-none hover:bg-brand-red-hover focus-visible:ring-2 focus-visible:ring-brand-red/40"
    >
      <RefreshCw size={16} />
      Повторить
    </button>
  )
}

/**
 * Список уведомлений с шапкой (макеты SJ0NJ, eKukg). Пока данные есть, при обновлении
 * и ошибке они остаются на экране: состояние показывается баннером, а не вместо списка.
 */
export function NotificationsList({
  items,
  state,
  unreadCount = 0,
  connection = 'online',
  hasMore,
  loadingMore,
  onOpen,
  onReadAll,
  onLoadMore,
  onRetry,
  onClose,
  hideHeader = false,
}: NotificationsListProps) {
  const hasData = items.length > 0
  let body
  if (hasData) {
    body = (
      <div aria-busy={state === 'loading'} className="flex flex-col gap-0.5 overflow-auto p-2 pt-0">
        {connection === 'reconnecting' ? (
          <div role="status" className="mx-1 mb-1 flex items-center gap-2.5 rounded-lg bg-warning-soft px-3.5 py-2.5">
            <Loader size={16} className="shrink-0 animate-spin text-warning" />
            <div className="flex flex-col gap-px">
              <p className="text-[13px] font-bold text-ink">Нет соединения · переподключаемся…</p>
              <p className="text-xs text-ink-60">Список обновится сам, когда связь восстановится</p>
            </div>
          </div>
        ) : null}
        {state === 'loading' ? (
          <p className="flex items-center gap-2 rounded-[12px] bg-warning-soft px-3 py-2 text-[13px] text-ink">
            <Loader size={16} className="animate-spin text-warning" />
            Обновляем…
          </p>
        ) : null}
        {state === 'error' ? (
          <div role="alert" className="flex items-center gap-2 rounded-[12px] bg-warning-soft px-3 py-2 text-[13px] text-ink">
            <span className="flex-1">Не удалось обновить уведомления</span>
            <button type="button" onClick={onRetry} className="font-bold text-brand-red">
              Повторить
            </button>
          </div>
        ) : null}
        {items.map((item, index) => {
          const showGroup = item.group !== undefined && item.group !== items[index - 1]?.group
          return (
            <Fragment key={item.id}>
              {showGroup ? <p className="px-3 pt-3 pb-1 text-xs font-bold text-ink-60">{item.group}</p> : null}
              <NotificationItem item={item} onOpen={onOpen} />
            </Fragment>
          )
        })}
        {hasMore ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="mt-1 h-10 rounded-[20px] bg-surface-alt text-[13px] font-semibold text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50"
          >
            Показать ещё
          </button>
        ) : null}
      </div>
    )
  } else if (state === 'loading') {
    body = <SkeletonRows />
  } else if (state === 'error') {
    body = (
      <Message
        tone="error"
        title="Не удалось загрузить уведомления"
        text="Сервер недоступен. Проверьте подключение и повторите попытку"
        action={<RetryButton onRetry={onRetry} />}
      />
    )
  } else {
    body = (
      <Message
        tone="empty"
        title="Уведомлений пока нет"
        text="Здесь появятся назначенные вам задачи, расшифровки встреч и другие события"
      />
    )
  }

  return (
    <section aria-label="Уведомления" className="flex min-h-0 flex-1 flex-col bg-surface">
      {hideHeader ? null : (
        <header className="flex h-16 shrink-0 items-center gap-2 pr-3 pl-5">
          <h2 className="flex flex-1 items-center gap-2 text-lg font-semibold text-ink">
            Уведомления
            {unreadCount > 0 ? (
              <span className="rounded-[11px] bg-brand-red-soft px-[7px] py-0.5 text-xs font-bold text-brand-red">{unreadCount}</span>
            ) : null}
          </h2>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={onReadAll}
            className="inline-flex h-9 items-center gap-1.5 rounded-[18px] bg-surface-alt px-3.5 text-[13px] font-semibold text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50"
          >
            <CheckCheck size={16} />
            Прочитать все
          </button>
          {onClose ? (
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40"
            >
              <X />
            </button>
          ) : null}
        </header>
      )}
      {body}
    </section>
  )
}
