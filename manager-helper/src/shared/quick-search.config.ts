// Dictionaries for the quick search form. Edit here, not in env.

export type Segment = 'education' | 'courses'
export type LevelId = 'any' | 'college' | 'bachelor' | 'master' | 'postgrad' | 'mba'
export type EgeValue = 'unknown' | 'yes' | 'no'

export const LEVELS: { id: LevelId; label: string; phrase: string }[] = [
  { id: 'any', label: 'Любой', phrase: 'программы колледжа и бакалавриата' },
  { id: 'college', label: 'Колледж (СПО)', phrase: 'программы колледжа' },
  { id: 'bachelor', label: 'Бакалавриат и специалитет', phrase: 'бакалавриат и специалитет' },
  { id: 'master', label: 'Магистратура', phrase: 'магистратуру' },
  { id: 'postgrad', label: 'Аспирантура и ординатура', phrase: 'аспирантуру и ординатуру' },
  {
    id: 'mba',
    label: 'MBA и программы для руководителей',
    phrase: 'MBA и программы для руководителей',
  },
]

// Short level names used in auto-generated chat titles.
export const LEVEL_TITLES: Partial<Record<LevelId, string>> = {
  college: 'Колледж',
  bachelor: 'Бакалавриат',
  master: 'Магистратура',
  postgrad: 'Аспирантура и ординатура',
  mba: 'MBA',
}

// Client base options per level; levels not listed hide the field.
export const BASES: Partial<Record<LevelId, string[]>> = {
  college: ['9 классов', '11 классов'],
  any: ['11 классов', 'СПО-НПО', 'Высшее'],
  bachelor: ['11 классов', 'СПО-НПО', 'Высшее'],
}

export const EGE_LEVELS: LevelId[] = ['any', 'bachelor']
export const STATE_SUPPORT_HIDDEN: LevelId[] = ['mba']

export const MAX_DIRECTIONS = 3

// Direction tags with synonyms that are substituted into the query.
export const DIRECTIONS: { label: string; aliases: string[] }[] = [
  { label: 'Медицина', aliases: ['лечебное дело', 'сестринское дело', 'фармация'] },
  { label: 'Психология', aliases: ['клиническая психология'] },
  { label: 'Педагогика', aliases: ['педагогическое образование'] },
  { label: 'Лингвистика', aliases: ['иностранные языки', 'перевод'] },
  { label: 'Юриспруденция', aliases: ['право'] },
  { label: 'Экономика и финансы', aliases: ['банковское дело'] },
  { label: 'Менеджмент и бизнес', aliases: ['управление'] },
  { label: 'IT и программирование', aliases: ['информационные технологии'] },
  { label: 'Кибербезопасность', aliases: ['информационная безопасность'] },
  { label: 'Дизайн', aliases: ['графический дизайн'] },
  { label: 'Реклама и маркетинг', aliases: ['реклама', 'PR'] },
  { label: 'Театр/кино/ТВ', aliases: ['актёрское мастерство', 'кино и телевидение'] },
  { label: 'Логистика', aliases: [] },
  { label: 'Туризм и гостеприимство', aliases: ['гостиничное дело'] },
  { label: 'Спорт', aliases: ['физическая культура'] },
  { label: 'Международные отношения', aliases: [] },
]

export const COURSE_TOPICS = [
  'охрана труда',
  'бухгалтерия',
  'программирование',
  'дизайн',
  'маркетинг',
  'нейросети',
  'ЕГЭ/ОГЭ',
  'для детей',
  'театр',
  'музыка',
]

export const COUNTS: number[] = [3, 5, 10]
export const DEFAULT_COUNT = 5
