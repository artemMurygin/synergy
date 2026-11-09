import { ComposerPrimitive, useAuiState } from '@assistant-ui/react'
import { Button } from '@/components/ui/button'

interface ComposerProps {
  /** The agent is answering: the send button turns into "Остановить". */
  running: boolean
  /** The field is blocked (loading history, or the server still runs the agent). */
  disabled: boolean
  onStop: () => void
}

/** Question field and send / stop button. */
export function Composer({ running, disabled, onStop }: ComposerProps) {
  const text = useAuiState((s) => s.composer.text)
  const blank = text.trim() === ''

  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t p-3">
      <ComposerPrimitive.Input
        rows={2}
        disabled={disabled}
        placeholder="Вопрос агенту"
        onKeyDown={(event) => {
          // An empty question is never sent
          if (event.key === 'Enter' && !event.shiftKey && blank) event.preventDefault()
        }}
        className="max-h-32 min-h-13 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {running ? (
        <Button type="button" className="h-13 rounded-xl px-4 font-semibold" onClick={onStop}>
          Остановить
        </Button>
      ) : (
        <ComposerPrimitive.Send asChild>
          <Button
            type="submit"
            className="h-13 rounded-xl px-4 font-semibold"
            disabled={disabled || blank}
          >
            Спросить
          </Button>
        </ComposerPrimitive.Send>
      )}
    </ComposerPrimitive.Root>
  )
}
