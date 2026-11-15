import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Markdown } from '@/components/ui/markdown'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { guideErrorMessage } from '../model/guides.errors'
import { useSaveGuide } from '../model/use-save-guide'

const MAX_LENGTH = 50000
type Tab = 'text' | 'preview'
type Confirm = 'delete' | 'cancel' | null

const SVG = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function spaced(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function SaveError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.kind === 'conflict') {
    return (
      <Alert title="Агент перенесён в архив">Инструкцию архивного агента изменить нельзя. Текст остался в редакторе: скопируйте его, если он нужен</Alert>
    )
  }
  const detail =
    error.kind === 'bad_request' || error.kind === 'unavailable'
      ? guideErrorMessage(error)
      : 'Текст остался в редакторе. Проверьте соединение и нажмите «Сохранить» ещё раз'
  return (
    <Alert title="Не удалось сохранить инструкцию">
      <div className="flex flex-col items-start gap-2">
        <p>{detail}</p>
        <Button variant="outline" size="sm" className="h-8 px-3 text-[13px]" onClick={onRetry}>
          Повторить
        </Button>
      </div>
    </Alert>
  )
}

export interface GuideEditorProps {
  initialBody: string
  agentId: string
  onDone: () => void
}

/** Frames D4Q0f, f3gPbE, qoSjS, EKgBv, WLnTc, GvYMF, WA7PS, intnO. */
export function GuideEditor({ initialBody, agentId, onDone }: GuideEditorProps) {
  const [text, setText] = useState(initialBody)
  const [tab, setTab] = useState<Tab>('text')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const save = useSaveGuide(agentId)
  const over = text.length > MAX_LENGTH
  const pending = save.isPending

  function submit(): void {
    if (over || pending) return
    if (text.trim() === '') {
      if (initialBody.trim() === '') onDone()
      else setConfirm('delete')
      return
    }
    run()
  }

  function run(): void {
    save.mutate(text, { onSuccess: onDone })
  }

  function cancel(): void {
    if (pending) return
    if (text === initialBody) onDone()
    else setConfirm('cancel')
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3.5 min-[768px]:flex-row min-[768px]:items-center min-[768px]:gap-4 min-[768px]:px-5">
        <div role="tablist" aria-label="Режим редактора" className="flex w-fit gap-0.5 rounded-md bg-surface-sunken p-0.5">
          {(['text', 'preview'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('h-8 rounded px-4 text-[13px] font-semibold', tab === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-60 hover:text-ink')}
            >
              {id === 'text' ? 'Текст' : 'Просмотр'}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-ink-60">
          <svg {...SVG} className="size-3.5 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          {tab === 'text' ? 'Markdown: ## заголовок, 1. список, [текст](адрес), `код`, таблицы через |' : 'Так инструкцию увидят сотрудники'}
        </p>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-3 pt-4 min-[768px]:px-5">
        {save.error ? <SaveError error={save.error} onRetry={submit} /> : null}
        {tab === 'text' ? (
          <Textarea
            label="Текст инструкции"
            hideLabel
            value={text}
            disabled={pending}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="min-h-[220px] font-mono text-[13px] leading-[1.6] min-[768px]:min-h-[600px]"
          />
        ) : (
          <div className="min-h-[220px] rounded-md border border-border px-4 py-4 min-[768px]:min-h-[400px] min-[768px]:px-6 min-[768px]:py-5">
            <div className="max-w-[760px]">
              <Markdown>{text}</Markdown>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-xs">
          {over ? (
            <p role="alert" className="flex items-center gap-1.5 font-medium text-brand-red">
              <svg {...SVG} className="size-3.5 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              Текст длиннее 50 000 символов. Сократите его на {spaced(text.length - MAX_LENGTH)} символов, чтобы сохранить
            </p>
          ) : (
            <span />
          )}
          <span className={over ? 'font-semibold text-brand-red' : 'text-ink-60'}>{`${spaced(text.length)} / 50 000`}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-5 pt-3 min-[768px]:flex-row min-[768px]:items-center min-[768px]:px-5">
        <p className="flex flex-1 items-center gap-1.5 text-[13px] text-ink-60">
          <svg {...SVG} className="size-3.5 shrink-0">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Инструкцию увидят все сотрудники в карточке агента
        </p>
        <Button variant="outline" className="h-11" disabled={pending} onClick={cancel}>
          Отмена
        </Button>
        <Button className="h-11" disabled={over || pending} onClick={submit}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Удалить инструкцию?"
        description="Текст пустой, поэтому инструкция будет удалена. Сотрудники увидят «Инструкции пока нет»"
        confirmLabel="Удалить"
        cancelLabel="Вернуться к тексту"
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          run()
        }}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Отменить изменения?"
        description="Правки не сохранятся, в карточке останется прежняя инструкция"
        confirmLabel="Отменить изменения"
        cancelLabel="Продолжить правку"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          onDone()
        }}
      />
    </div>
  )
}
