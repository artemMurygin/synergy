/** Upper-case extension for the file icon: "PDF", "M4A"; empty when the name has none. */
export function fileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1, dot + 6).toUpperCase()
}
