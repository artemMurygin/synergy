import { DeadlinePicker } from '@synergy/ui-kit'
import { SheetBack } from './SheetBack'

interface Props {
  value: Date | null
  /** "Готово" and "Без срока" end here with the choice, "Назад" without it. */
  onChange: (value: Date | null) => void
  onBack: () => void
}

/** The nested sheet "Дедлайн" of the quick create (U2q8r): the calendar of the package. */
export function DeadlineSheet({ value, onChange, onBack }: Props) {
  return (
    <>
      <SheetBack title="Дедлайн" onBack={onBack} />
      <DeadlinePicker value={value} onChange={onChange} onClose={onBack} />
    </>
  )
}
