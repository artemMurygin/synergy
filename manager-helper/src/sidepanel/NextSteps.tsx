import { classifyAnswer } from '@/shared/quick-search'

const OVERVIEW_STEPS = [
  { label: 'Подробнее по 1-й', query: 'Расскажи подробнее про первую программу из списка' },
  { label: 'Вступительные', query: 'Какие вступительные испытания у программ из списка?' },
  { label: 'Показать ещё', query: 'Покажи ещё 5 похожих программ, кроме уже названных' },
]

const CARD_STEPS = [
  {
    label: 'Что говорить клиенту',
    query:
      'Дай короткий скрипт для разговора с клиентом по этой программе: 4–5 тезисов по данным таблицы, без выдуманных фактов',
  },
  { label: 'Вступительные', query: 'Какие вступительные испытания у этой программы?' },
  { label: 'Все формы и цены', query: 'Покажи все формы обучения и цены этой программы' },
]

interface Props {
  disabled?: boolean
  lastAnswer: string
  onSend: (query: string) => void
  onNewSearch: () => void
}

export function NextSteps({ lastAnswer, onSend, onNewSearch, disabled }: Props) {
  const kind = classifyAnswer(lastAnswer)
  const steps = kind === 'overview' ? OVERVIEW_STEPS : kind === 'card' ? CARD_STEPS : []
  const chip = 'rounded-full border px-3 py-1 text-xs'

  return (
    <div className="flex flex-wrap gap-2 bg-white px-3 pb-3">
      {steps.map((step) => (
        <button
          key={step.label}
          type="button"
          disabled={disabled}
          className={`${chip} border-brand-red bg-brand-red-soft font-medium text-brand-red hover:bg-brand-red/20 disabled:opacity-50`}
          onClick={() => {
            onSend(step.query)
          }}
        >
          {step.label}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        className={`${chip} border-line bg-white font-medium text-ink-60 hover:bg-surface-alt disabled:opacity-50`}
        onClick={onNewSearch}
      >
        Новый подбор
      </button>
    </div>
  )
}
