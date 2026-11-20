import { DEFAULT_COUNT } from '@/shared/quick-search.config'
import type { QuickSearchForm } from '@/shared/quick-search'

/** Values of the quick search form: the same shape `buildQuickSearchQuery` takes. */
export type QuickSearchValues = QuickSearchForm

export const DEFAULT_QUICK_SEARCH: QuickSearchValues = {
  segment: 'education',
  level: 'any',
  base: '',
  directions: [],
  ege: 'unknown',
  stateSupport: false,
  topics: [],
  topicText: '',
  count: DEFAULT_COUNT,
}
