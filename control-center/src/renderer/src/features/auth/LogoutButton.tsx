import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLogout } from './use-logout'

export function LogoutButton() {
  const logout = useLogout()
  return (
    <Button
      variant="outline"
      disabled={logout.isPending}
      onClick={() => logout.mutate()}
      className="h-9 shrink-0 gap-1.5 rounded-md border-border-strong bg-surface px-3 text-[13px] font-semibold text-foreground hover:bg-surface-alt hover:text-foreground"
    >
      <LogOut aria-hidden className="size-4" />
      Выйти
    </Button>
  )
}
