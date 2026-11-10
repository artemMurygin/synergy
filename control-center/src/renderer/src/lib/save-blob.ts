/** Saves a blob through a temporary `<a download>` link, under the given file name. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // the download has started by now; the URL can be released
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
