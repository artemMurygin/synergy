import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

function Svg({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/** Static "not found" block with a way back; used by the unknown route and by RequestPage. */
export interface NotFoundViewProps {
  title: string
  text: string
  /** The way back; the requests of the user when absent (and then "Подать идею" is offered as well). */
  back?: { to: string; label: string }
}

export function NotFoundView({ title, text, back }: NotFoundViewProps) {
  return (
    <section className="mx-auto flex max-w-[460px] flex-col items-center gap-3.5 pt-[98px] text-center">
      <span className="flex size-16 items-center justify-center rounded-full border border-border bg-surface text-ink-60">
        <Svg size={28}>
          <path d="m13.5 8.5-5 5" />
          <path d="m8.5 8.5 5 5" />
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </Svg>
      </span>
      <h1 className="font-display text-[26px] font-bold leading-[33px] tracking-[-0.4px] text-ink">{title}</h1>
      <p className="text-sm leading-[1.5] text-ink-60">{text}</p>
      <div className="flex flex-wrap justify-center gap-2.5 pt-2">
        <Button asChild>
          <Link to={back?.to ?? '/requests'}>
            <Svg size={18}>
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </Svg>
            {back?.label ?? 'К моим заявкам'}
          </Link>
        </Button>
        {back ? null : (
          <Button asChild variant="outline">
            <Link to="/ideas/new">Подать идею</Link>
          </Button>
        )}
      </div>
    </section>
  )
}
