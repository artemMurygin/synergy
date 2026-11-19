import type { ReactNode } from 'react'
import { useLayoutMode } from '../layout/layout-mode'
import { NavRail, type NavItem } from './NavRail'
import { TabBar } from './TabBar'

export type AppFrameProps = {
  /** Нижняя часть рейла (уведомления, профиль); в mobile рисуется приложением в `header`. */
  nav?: ReactNode
  header?: ReactNode
  body: ReactNode
  sections: NavItem[]
  activeSection: string
  onSectionChange: (id: string) => void
}

/** Оболочка приложения: рейл (desktop/tablet) или плавающий таб-бар с отступом (mobile). */
export function AppFrame({ nav, header, body, sections, activeSection, onSectionChange }: AppFrameProps) {
  const mode = useLayoutMode()
  if (mode === 'mobile') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface">
        {header}
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        <div data-slot="tab-bar-spacer" aria-hidden="true" className="h-[88px] shrink-0" />
        <TabBar items={sections} active={activeSection} onSelect={onSectionChange} />
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 gap-2.5 bg-surface-sunken p-2.5">
      <NavRail items={sections} active={activeSection} onSelect={onSectionChange} footer={nav} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        <div className="flex min-h-0 flex-1">{body}</div>
      </div>
    </div>
  )
}
