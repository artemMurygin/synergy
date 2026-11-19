export function describedBy(el: Element): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim()
}

/** Element of a list the test knows to be there. */
export function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value')
  return value
}
