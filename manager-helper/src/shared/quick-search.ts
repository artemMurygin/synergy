import {
  BASES,
  DIRECTIONS,
  EGE_LEVELS,
  LEVELS,
  LEVEL_TITLES,
  STATE_SUPPORT_HIDDEN,
} from './quick-search.config'
import type { EgeValue, LevelId, Segment } from './quick-search.config'

export interface QuickSearchForm {
  segment: Segment
  level: LevelId
  base: string
  directions: string[]
  ege: EgeValue
  stateSupport: boolean
  topics: string[]
  topicText: string
  count: number
}

export type AnswerKind = 'overview' | 'card' | 'other'

export function buildQuickSearchQuery(form: QuickSearchForm): string {
  if (form.segment === 'courses') {
    const topics = [...form.topics, form.topicText.trim()].filter((t) => t.length > 0)
    const theme = topics.length > 0 ? ` по теме «${topics.join(', ')}»` : ''
    return `Подбери курсы и ДПО${theme}. Программы колледжа, бакалавриата и магистратуры не нужны. Покажи обзор, до ${String(form.count)} вариантов.`
  }

  const levelPhrase = LEVELS.find((l) => l.id === form.level)?.phrase ?? ''
  const parts: string[] = []
  const names = form.directions.map((label) => {
    const aliases = DIRECTIONS.find((d) => d.label === label)?.aliases ?? []
    return aliases.length > 0 ? `${label} (${aliases.join(', ')})` : label
  })
  const direction = names.length > 0 ? ` по направлению «${names.join(', ')}»` : ''
  parts.push(`Подбери ${levelPhrase}${direction}.`)

  if (form.base && BASES[form.level]?.includes(form.base)) parts.push(`База: ${form.base}.`)
  if (form.stateSupport && !STATE_SUPPORT_HIDDEN.includes(form.level)) {
    parts.push('Только с господдержкой.')
  }
  if (EGE_LEVELS.includes(form.level)) {
    if (form.ege === 'yes') {
      parts.push(
        'У клиента есть ЕГЭ — укажи, какие вступительные испытания у программ и какие предметы нужны.',
      )
    } else if (form.ege === 'no') {
      parts.push(
        'У клиента нет ЕГЭ — подскажи, какие вступительные испытания нужны (профессиональное или внутреннее тестирование), и есть ли программы без экзаменов.',
      )
    }
  }
  parts.push(`Покажи обзор, до ${String(form.count)} программ.`)
  return parts.join(' ')
}

const MAX_TITLE_LENGTH = 120

// Short chat title from the form parameters, e.g. «Бакалавриат · Медицина».
export function buildQuickSearchTitle(form: QuickSearchForm): string {
  let title: string
  if (form.segment === 'courses') {
    const topics = [...form.topics, form.topicText.trim()].filter((t) => t.length > 0)
    title = ['Курсы и ДПО', topics.join(', ')].filter((p) => p.length > 0).join(' · ')
  } else {
    const parts = [LEVEL_TITLES[form.level] ?? '', form.directions.join(', ')]
    title = parts.filter((p) => p.length > 0).join(' · ') || 'Подбор программ'
  }
  return title.slice(0, MAX_TITLE_LENGTH).trim()
}

// Simple text heuristic; see the spec, section 5.1.
export function classifyAnswer(text: string): AnswerKind {
  if (text.includes('###') || text.includes('Источник:')) return 'card'
  const items = text.match(/^\s*\d+\.\s/gm)
  if (items && items.length >= 2) return 'overview'
  return 'other'
}
