/** Initials of a full name: the first letters of the first two words; one word (a login) gives its first two letters. */
export function initials(fullName: string): string {
  const words = fullName.split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => word.charAt(0)).join('') : (words[0] ?? '').slice(0, 2)
  return letters.toUpperCase()
}
