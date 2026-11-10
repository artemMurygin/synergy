import { LogoutButton } from './LogoutButton'
import { useSessionStore } from './session.store'

export function SidebarFooter() {
  const login = useSessionStore((store) => store.snapshot.user?.login)
  return (
    <div className="flex h-18 shrink-0 items-center gap-2.5 border-t bg-surface-alt px-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] leading-[15px] font-semibold text-foreground">{login}</span>
        <span className="truncate text-xs leading-[14px] font-normal text-muted-foreground">
          Вы вошли в систему
        </span>
      </div>
      <LogoutButton />
    </div>
  )
}
