interface Props {
  serverUrl: string
  onChangeServer: () => void
}

/** "Сервер: … Изменить" for the `footer` slot of the package auth screens. */
export function ServerLine({ serverUrl, onChangeServer }: Props) {
  return (
    <div className="flex items-center justify-center gap-1.5 text-xs text-ink-60">
      <span>Сервер: {serverUrl.replace(/^https?:\/\//, '')}</span>
      <button type="button" className="font-semibold text-brand-red" onClick={onChangeServer}>
        Изменить
      </button>
    </div>
  )
}
