import { useQuery } from '@tanstack/react-query'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { archiveQuery, ArchiveLists } from '@/features/archive'

export function ArchivePage() {
  const query = useQuery(archiveQuery())
  const data = query.data

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[26px] font-bold leading-[33px] tracking-[-0.6px] text-ink lg:text-[32px] lg:leading-[41px]">Архив</h1>
        <p className="text-[13px] leading-4 text-ink-60 lg:text-sm">
          Агенты и навыки, убранные из каталога. Восстановленные вернутся в каталог, роадмап и список навыков
        </p>
      </div>
      {query.isPending ? (
        <p role="status" className="text-sm text-ink-60">
          Загружаем архив…
        </p>
      ) : query.isError && !data ? (
        <div className="flex flex-col items-start gap-3">
          <Alert title="Не удалось загрузить архив">{query.error.message}</Alert>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      ) : data ? (
        <ArchiveLists archive={data} />
      ) : null}
    </section>
  )
}
