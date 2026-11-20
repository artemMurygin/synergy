import { ArrowUpRight } from '../icons'
import { nextStepsFor } from './next-steps'

type NextStepsProps = {
  lastAnswer: string
  /** The agent is answering or the run failed: the hints are not shown. */
  disabled: boolean
  onSend: (query: string) => void
}

/** Hints of the next step above the composer (Suggestion chips). */
export function NextSteps({ lastAnswer, disabled, onSend }: NextStepsProps) {
  const steps = disabled ? [] : nextStepsFor(lastAnswer)
  if (steps.length === 0) return null
  return (
    <div aria-label="Подсказки" role="group" className="flex flex-wrap gap-2">
      {steps.map((step) => (
        <button
          key={step.label}
          type="button"
          onClick={() => {
            onSend(step.query)
          }}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-surface-alt bg-surface-alt pr-2.5 pl-3 font-chat text-[13px] text-ink-80 transition-colors outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          {step.label}
          <ArrowUpRight size={14} className="text-ink-40" />
        </button>
      ))}
    </div>
  )
}
