import { useAui } from '@assistant-ui/react'
import { Sparkles } from '../icons'
import { useOptionalLayoutMode } from '../layout/layout-mode'
import { cn } from '../lib/cn'

export type WelcomeSuggestion = {
  title: string
  /** Fragment to finish in the field: the card does not send anything. */
  example: string
}

export const WELCOME_SUGGESTIONS: readonly WelcomeSuggestion[] = [
  { title: 'Цены на программу', example: 'МВА «Маркетинг», очно, Москва' },
  { title: 'Сравнить программы', example: 'Бакалавриат или ДПО по HR' },
  { title: 'Условия рассрочки', example: 'Для физлиц и компаний' },
  { title: 'Найти в таблицах', example: 'Свободные места на март' },
]

export type ThreadWelcomeProps = {
  suggestions?: readonly WelcomeSuggestion[]
}

/** Focuses the field of the chat form (`Composer` marks its input). */
function focusComposerInput() {
  document.querySelector<HTMLTextAreaElement>('[data-chat-composer-input]')?.focus()
}

/** Start window of a new chat: the mark, the heading and cards that put the start of a question into the field. */
export function ThreadWelcome({ suggestions = WELCOME_SUGGESTIONS }: ThreadWelcomeProps) {
  const aui = useAui()
  const mode = useOptionalLayoutMode() ?? 'desktop'
  const desktop = mode === 'desktop'
  const shown = suggestions.slice(0, desktop ? 4 : 3)

  const pick = (item: WelcomeSuggestion) => {
    if (aui.composer.getState().text.trim() === '') {
      aui.composer.setText(`${item.title}: ${item.example}`)
    }
    focusComposerInput()
  }

  return (
    <section
      aria-label="Начало чата"
      className={cn('m-auto flex w-full max-w-180 flex-col py-8', desktop ? 'gap-7' : 'gap-5')}
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-brand-red-soft text-brand-red',
            desktop ? 'size-14' : 'size-12',
          )}
        >
          <Sparkles size={desktop ? 26 : 22} />
        </span>
        <h2 className={cn('font-display font-semibold text-ink', desktop ? 'text-[28px]' : 'text-[22px]')}>
          Чем помочь?
        </h2>
        <p className={cn('leading-[1.45] text-ink-60', desktop ? 'text-[15px]' : 'text-sm')}>
          Начните новый чат по любой теме: цены, программы, документы
        </p>
      </div>
      <div className={cn('grid gap-2', desktop ? 'grid-cols-2' : 'grid-cols-1')}>
        {shown.map((item) => (
          <button
            key={item.title}
            type="button"
            data-suggestion=""
            onClick={() => {
              pick(item)
            }}
            className="flex flex-col gap-0.5 rounded-lg bg-surface-alt px-4 py-3 text-left outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <span className="font-chat text-sm font-semibold text-ink">{item.title}</span>
            <span className="font-chat text-[13px] text-ink-60">{item.example}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
