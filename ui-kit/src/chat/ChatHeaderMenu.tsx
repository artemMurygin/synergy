import { Ellipsis, Pencil, Trash2 } from '../icons'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../primitives/Menu'

export type ChatHeaderMenuProps = {
  onRename: () => void
  onDelete: () => void
  /** A new chat without messages has nothing to rename or delete. */
  disabled?: boolean
}

/** Button «…» in the header of the chat with the menu «Переименовать» / «Удалить» (Chat Menu). */
export function ChatHeaderMenu({ onRename, onDelete, disabled = false }: ChatHeaderMenuProps) {
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Меню чата"
          disabled={disabled}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Ellipsis size={18} />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="flex w-[220px] flex-col gap-0.5 rounded-[20px] p-2">
        <MenuItem onSelect={onRename} className="h-11 gap-3 rounded-[14px] px-3 text-sm text-ink-80">
          <Pencil size={18} />
          Переименовать
        </MenuItem>
        <MenuItem onSelect={onDelete} className="h-11 gap-3 rounded-[14px] px-3 text-sm text-brand-red">
          <Trash2 size={18} />
          Удалить
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
