export type AnswerKind = 'overview' | 'card' | 'other'

export type NextStep = { label: string; query: string }

export const OVERVIEW_STEPS: readonly NextStep[] = [
  { label: 'Подробнее по 1-й', query: 'Расскажи подробнее про первую программу из списка' },
  { label: 'Вступительные', query: 'Какие вступительные испытания у программ из списка?' },
  { label: 'Показать ещё', query: 'Покажи ещё 5 похожих программ, кроме уже названных' },
]

export const CARD_STEPS: readonly NextStep[] = [
  {
    label: 'Что говорить клиенту',
    query:
      'Дай короткий скрипт для разговора с клиентом по этой программе: 4–5 тезисов по данным таблицы, без выдуманных фактов',
  },
  { label: 'Вступительные', query: 'Какие вступительные испытания у этой программы?' },
  { label: 'Все формы и цены', query: 'Покажи все формы обучения и цены этой программы' },
]

/** Simple text heuristic: a program card, an overview (numbered list of 2+ items) or anything else. */
export function classifyAnswer(text: string): AnswerKind {
  if (text.includes('###') || text.includes('Источник:')) return 'card'
  const items = text.match(/^\s*\d+\.\s/gm)
  if (items && items.length >= 2) return 'overview'
  return 'other'
}

export function nextStepsFor(answer: string): readonly NextStep[] {
  const kind = classifyAnswer(answer)
  if (kind === 'overview') return OVERVIEW_STEPS
  if (kind === 'card') return CARD_STEPS
  return []
}
