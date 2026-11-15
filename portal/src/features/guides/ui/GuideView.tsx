import { Markdown } from '@/components/ui/markdown'
import type { GuideResponse } from '../model/guides.schema'

const SVG = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** Frames Evo3D / uJtZy: the markdown is limited to 760 px at 1440 (ui-design, deviation 3), the caption sits in the footer. */
export function GuideView({ guide }: { guide: GuideResponse }) {
  const caption = guide.updatedAt
    ? ['Изменено ' + formatUpdated(guide.updatedAt), guide.updatedBy?.fullName].filter(Boolean).join(' · ')
    : null
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border bg-surface px-4 pt-5 min-[768px]:gap-6 min-[768px]:px-8 min-[768px]:pt-7">
      <div className="max-w-[760px]">
        <Markdown>{guide.body ?? ''}</Markdown>
      </div>
      {caption ? (
        <p className="flex items-center gap-2 border-t border-border pb-3.5 pt-3 text-[13px] text-ink-60 min-[768px]:pb-4 min-[768px]:pt-3.5">
          <svg {...SVG} className="size-3.5 shrink-0 text-ink-40">
            <path d="M13 21h8" />
            <path d="m15 5 4 4" />
            <path d="M12.5 5.5 3 15v4h4l9.5-9.5" />
          </svg>
          {caption}
        </p>
      ) : (
        <div className="pb-4" />
      )}
    </div>
  )
}
