import type { Catalog } from '@/lib/schemas'

const cc = {
  id: 'p-cc',
  slug: 'control-center',
  name: 'Control Center',
  departments: [
    { id: 'd-kc1', name: 'КЦ 1' },
    { id: 'd-kc2', name: 'КЦ 2' }
  ]
}
const tg = { id: 'p-tg', slug: 'telegram-bot', name: 'Telegram-бот', departments: [] }
const web = { id: 'p-web', slug: 'web', name: 'Веб', departments: [] }

const skill = (id: string, name: string, status: Catalog['products'][number]['agents'][number]['skills'][number]['status']) => ({
  id,
  name,
  description: `${name} — описание`,
  status,
  statusChangedAt: '2026-11-02T09:00:00.000Z',
  nextStatuses: []
})

const assistant = {
  id: 'a-assistant',
  slug: 'assistant',
  name: 'Ассистент',
  status: { code: 'working' as const, label: 'Работает' },
  products: [cc, tg],
  skills: [skill('s1', 'Сводка встречи', 'launched'), skill('s2', 'Поиск по почте', 'planned')]
}
const analyst = {
  id: 'a-analyst',
  slug: 'call-analyst',
  name: 'Аналитик звонков',
  status: { code: 'in_development' as const, label: 'В разработке' },
  products: [cc],
  skills: [skill('s3', 'Разбор звонка', 'in_dev')]
}

export const catalogFixture: Catalog = {
  products: [
    { ...cc, agents: [assistant, analyst] },
    { ...tg, agents: [assistant] },
    { ...web, agents: [] }
  ]
}
