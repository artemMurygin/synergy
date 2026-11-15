function pick(n: number, one: string, few: string, many: string): string {
  const m100 = n % 100
  const m10 = n % 10
  if (m100 >= 11 && m100 <= 14) return many
  if (m10 === 1) return one
  if (m10 >= 2 && m10 <= 4) return few
  return many
}

export function skillsCount(n: number): string {
  return n === 0 ? 'Навыков пока нет' : `${n} ${pick(n, 'навык', 'навыка', 'навыков')}`
}

export function agentsCount(n: number): string {
  return n === 0 ? 'Агентов нет' : `${n} ${pick(n, 'агент', 'агента', 'агентов')}`
}

/** "с 1 навыком", "с 3 навыками" (instrumental case). */
export function withSkills(n: number): string {
  return `${n} ${pick(n, 'навыком', 'навыками', 'навыками')}`
}
