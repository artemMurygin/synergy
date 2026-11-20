import { Check } from '../icons'
import { Button } from '../primitives/Button'

export type PasswordChangedScreenProps = {
  onContinue: () => void
}

/** Успех добровольной смены пароля (макет KxBWe): другие сеансы завершены, этот остаётся. */
export function PasswordChangedScreen({ onContinue }: PasswordChangedScreenProps) {
  return (
    <div className="flex flex-col items-center gap-4 pt-2 pb-2 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
        <Check size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-xl font-bold text-ink">Пароль изменён</h3>
        <p className="text-sm text-ink-60">Все другие сеансы завершены. На этом устройстве вы остаётесь в системе.</p>
      </div>
      <Button type="button" onClick={onContinue} className="w-full rounded-full">
        Вернуться к работе
      </Button>
    </div>
  )
}
