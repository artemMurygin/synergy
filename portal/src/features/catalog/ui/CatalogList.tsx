import type { CatalogProduct } from '@/lib/schemas'
import { AgentTile } from './AgentTile'
import { agentsCount } from './plural'

const SVG = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

const ICONS: Record<string, React.ReactNode> = {
  'control-center': (
    <>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),
  'manager-helper': (
    <path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z" />
  ),
  'telegram-bot': (
    <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  )
}

const FALLBACK_ICON = (
  <>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </>
)

function ProductIcon({ slug }: { slug: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-ink-80">
      <svg {...SVG} className="size-4">
        {ICONS[slug] ?? FALLBACK_ICON}
      </svg>
    </span>
  )
}

function NoAgents() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-5 py-4">
      <svg {...SVG} className="size-[18px] text-ink-40">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
      <p className="text-sm font-semibold text-ink-60">Агентов пока нет</p>
    </div>
  )
}

export function CatalogList({ products }: { products: CatalogProduct[] }) {
  return (
    <div className="flex flex-col gap-7 min-[768px]:gap-8">
      {products.map((product) => (
        <section
          key={product.id}
          aria-labelledby={`catalog-product-${product.id}`}
          className="flex flex-col gap-3 min-[768px]:gap-3.5"
        >
          <div className="flex items-center gap-3">
            <ProductIcon slug={product.slug} />
            <h2
              id={`catalog-product-${product.id}`}
              className="font-display text-lg font-bold text-ink min-[768px]:text-xl"
            >
              {product.name}
            </h2>
            <span className="text-[13px] text-ink-60">{agentsCount(product.agents.length)}</span>
          </div>
          {product.agents.length === 0 ? (
            <NoAgents />
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-3 min-[768px]:grid-cols-2 min-[768px]:gap-4 min-[1024px]:grid-cols-3">
              {product.agents.map((agent) => (
                <AgentTile key={agent.id} agent={agent} product={product} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
