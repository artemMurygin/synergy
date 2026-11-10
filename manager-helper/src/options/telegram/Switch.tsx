interface SwitchProps {
  isChecked: boolean
  isDisabled: boolean
  label: string
  descriptionId?: string
  onChange: (isChecked: boolean) => void
}

export function Switch({ isChecked, isDisabled, label, descriptionId, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-label={label}
      aria-describedby={descriptionId}
      disabled={isDisabled}
      className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.75 transition-colors disabled:cursor-default disabled:opacity-50 ${
        isChecked ? 'justify-end bg-brand-red' : 'justify-start bg-field-line'
      }`}
      onClick={() => {
        onChange(!isChecked)
      }}
    >
      <span className="size-4.5 rounded-full bg-white shadow-[0_1px_3px_#00000026]" />
    </button>
  )
}
