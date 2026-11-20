import { Button, Dialog, DialogContent, Input } from '@synergy/ui-kit'
import { useState } from 'react'

const MAX_TITLE_LENGTH = 120

export type HeaderDialog = 'rename' | 'delete' | null

interface Props {
  open: HeaderDialog
  title: string
  onClose: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

function RenameForm({ title, onClose, onRename }: Pick<Props, 'title' | 'onClose' | 'onRename'>) {
  const [value, setValue] = useState(title)
  const next = value.trim()
  const valid = next.length > 0 && next.length <= MAX_TITLE_LENGTH
  const submit = () => {
    if (!valid) return
    if (next !== title) onRename(next)
    onClose()
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Input
        autoFocus
        aria-label="Название чата"
        value={value}
        maxLength={MAX_TITLE_LENGTH}
        onChange={(event) => {
          setValue(event.target.value)
        }}
      />
      <div className="flex justify-end gap-2 pb-3">
        <Button type="button" variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" disabled={!valid}>
          Сохранить
        </Button>
      </div>
    </form>
  )
}

/** Rename and delete of the open chat from the menu of the header: the same actions and the same confirmation as in the list. */
export function ChatHeaderDialogs({ open, title, onClose, onRename, onDelete }: Props) {
  return (
    <>
      <Dialog
        open={open === 'rename'}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent title="Переименовать чат">
          <RenameForm title={title} onClose={onClose} onRename={onRename} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={open === 'delete'}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent
          title="Удалить чат?"
          description={`Чат «${title}» и вся его переписка будут удалены.`}
          footer={
            <>
              <Button variant="secondary" onClick={onClose}>
                Отмена
              </Button>
              <Button
                onClick={() => {
                  onDelete()
                  onClose()
                }}
              >
                Удалить чат
              </Button>
            </>
          }
        >
          {null}
        </DialogContent>
      </Dialog>
    </>
  )
}
