import { cn } from '../lib/cn'

/** Timer of the record «m:ss». */
export function formatTimer(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  return `${String(Math.floor(sec / 60))}:${String(sec % 60).padStart(2, '0')}`
}

/** Heights of the bars of the wave at the full level (design: 24 bars, 3 px wide). */
const WAVE = [6, 10, 16, 8, 12, 18, 14, 6, 10, 16, 20, 12, 8, 14, 10, 6, 12, 16, 8, 4, 10, 14, 6, 8]
const ACTIVE_BARS = 16

type VoiceRecorderBarProps = {
  elapsedSec: number
  /** Level of the signal 0..1. */
  level: number
}

/** Row of the record in the form (Recording): red dot, timer, wave and the hint «Говорите…». */
export function VoiceRecorderBar({ elapsedSec, level }: VoiceRecorderBarProps) {
  const gain = 0.5 + 0.5 * Math.min(1, Math.max(0, level))
  return (
    <div role="status" aria-label="Идёт запись" className="flex items-center gap-2.5 p-1.5 font-chat">
      <span className="size-2 shrink-0 rounded-full bg-brand-red" />
      <span className="shrink-0 text-sm tabular-nums text-ink">{formatTimer(elapsedSec)}</span>
      <div data-testid="voice-wave" aria-hidden className="flex h-5 min-w-0 flex-1 items-center justify-between overflow-hidden">
        {WAVE.map((height, index) => (
          <span
            key={index}
            style={{ height: `${String(Math.max(4, Math.round(height * gain)))}px` }}
            className={cn('w-[3px] shrink-0 rounded-sm transition-[height] duration-100', index < ACTIVE_BARS ? 'bg-ink-60' : 'bg-border')}
          />
        ))}
      </div>
      <span className="shrink-0 text-[13px] text-ink-40">Говорите…</span>
    </div>
  )
}
