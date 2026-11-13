import { useNavigate } from 'react-router'
import { RequestForm } from '@/features/requests'

export function NewIdeaPage() {
  const navigate = useNavigate()
  return (
    <section className="flex flex-col gap-4 min-[1024px]:gap-6">
      <header className="flex flex-col gap-1 min-[640px]:gap-1.5">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.4px] text-ink min-[640px]:text-[28px] min-[640px]:tracking-[-0.5px] min-[1024px]:text-[32px] min-[1024px]:tracking-[-0.6px]">
          Новая идея
        </h1>
        <p className="text-[13px] text-ink-60 min-[1024px]:text-sm">
          Опишите рутину, которую можно отдать ИИ.
          <span className="max-[639px]:hidden"> Чем точнее цифры, тем быстрее заявку возьмут в работу.</span>
        </p>
      </header>
      <RequestForm
        onSubmitted={() => void navigate('/requests', { state: { submitted: true } })}
        onCancel={() => void navigate('/requests')}
      />
    </section>
  )
}
