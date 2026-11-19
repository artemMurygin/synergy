import { ListChecks, MessageSquare } from '@synergy/ui-kit/icons'
import type { NavItem } from '@synergy/ui-kit'
import { ProfileMenuContainer } from '@/features/auth/ProfileMenuContainer'
import { NotificationsButton } from '@/features/notifications/NotificationsButton'
import { useUiStore, type AppSection } from '@/stores/ui.store'

const SECTIONS: (NavItem & { id: AppSection })[] = [
  { id: 'chats', label: 'Чаты', icon: <MessageSquare /> },
  { id: 'tasks', label: 'Задачи', icon: <ListChecks /> }
]

const isSection = (id: string): id is AppSection => SECTIONS.some((section) => section.id === id)

// Sections of the rail (package NavRail inside AppFrame) come from the ui store
export function useNavSections() {
  const active = useUiStore((s) => s.section)
  const setSection = useUiStore((s) => s.setSection)
  return {
    items: SECTIONS,
    active,
    select: (id: string) => {
      if (isSection(id)) setSection(id)
    }
  }
}

// Bottom group of the rail: notifications and the profile menu (frames VHpuS, TLMEl)
export function NavRailFooter() {
  return (
    <>
      <NotificationsButton />
      <ProfileMenuContainer />
    </>
  )
}
