export function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'Неизвестная ошибка'
}
