import { useId } from 'react'
import { useAuthSession } from '@/shared/auth'
import { TelegramLinkPanels } from '@/sidepanel/telegram/TelegramLinkPanels'
import { useTelegramLink } from './use-telegram-link'

/** Telegram section of the settings page: the same panels as the side panel pane. */
export function TelegramSection() {
  const session = useAuthSession()
  const link = useTelegramLink(session.status)
  const headingId = useId()
  if (link.state.kind === 'unavailable') return null
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={link.state.kind === 'loading'}
      className="rounded-xl bg-surface p-5 shadow-panel"
    >
      <h2 id={headingId} className="sr-only">
        Telegram
      </h2>
      <TelegramLinkPanels link={link} />
    </section>
  )
}
