import { itemSchema, type Item } from './schema'

// Заглушка: заменить на IPC-вызов (window.api) или HTTP-клиент.
const mock: unknown[] = [
  { id: 1, name: 'Первый элемент', status: 'active' },
  { id: 2, name: 'Второй элемент', status: 'paused' },
  { id: 3, name: 'Третий элемент', status: 'done' }
]

export async function fetchItems(): Promise<Item[]> {
  return itemSchema.array().parse(mock)
}
