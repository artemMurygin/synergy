import { useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import type { DepartmentRef } from '@/lib/schemas'
import { useSetProductDepartments } from '../model/use-set-product-departments'

export type DepartmentOption = DepartmentRef

export interface ProductAccessDialogProps {
  product: { id: string; name: string; departments: DepartmentRef[] }
  /** The whole department directory (any order; the dialog sorts it by name). */
  departments: DepartmentOption[]
  open: boolean
  onClose: () => void
}

function selectedLabel(n: number, total: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? `Выбран ${String(n)} отдел из ${String(total)}` : `Выбрано ${String(n)} из ${String(total)}`
}

const SVG = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function EmptyDirectory({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-border px-6 py-7 text-center">
      <span className="flex size-12 items-center justify-center rounded-pill bg-surface-sunken text-ink-60">
        <svg {...SVG} className="size-[22px]">
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
          <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
        </svg>
      </span>
      <p className="font-display text-base font-bold text-ink">В справочнике нет отделов</p>
      <p className="text-sm text-ink-60">Сначала добавьте отделы, затем отметьте их здесь</p>
      <Link to="/admin/departments" onClick={onClose} className="flex items-center gap-1.5 text-sm font-semibold text-brand-red">
        Перейти в «Отделы»
        <svg {...SVG} className="size-4">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}

function Content({ product, departments, onClose }: Omit<ProductAccessDialogProps, 'open'>) {
  const save = useSetProductDepartments()
  const [selected, setSelected] = useState(() => new Set(product.departments.map((d) => d.id)))
  const sorted = [...departments].sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id))
  // marks of departments that disappeared from the directory (404, then reload) are dropped
  const chosen = sorted.filter((d) => selected.has(d.id)).map((d) => d.id)
  const pending = save.isPending
  const empty = sorted.length === 0

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const notFoundTitle = save.error?.code === 'PORTAL_PRODUCT_NOT_FOUND' ? 'Продукт уже удалён' : 'Отдел уже удалён'

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!pending}
      title="Доступ отделов"
      description={`${product.name}. Отметьте отделы, которым доступен продукт. Подпись в каталоге справочная и не меняет права доступа`}
      compactSheet
      footer={
        empty ? (
          <Button variant="outline" className="h-12 w-full sm:w-auto" onClick={onClose}>
            Закрыть
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-12 w-full sm:w-auto" disabled={pending} onClick={onClose}>
              Отмена
            </Button>
            <Button
              className="h-12 w-full sm:w-auto"
              disabled={pending}
              onClick={() => save.mutate({ productId: product.id, departmentIds: chosen }, { onSuccess: onClose })}
            >
              {pending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </>
        )
      }
    >
      {save.isError ? (
        save.error.status === 404 ? (
          <Alert title={notFoundTitle}>Список отделов обновлён. Проверьте отметки и сохраните ещё раз</Alert>
        ) : (
          <Alert>{save.error.message}</Alert>
        )
      ) : null}
      {empty ? (
        <EmptyDirectory onClose={onClose} />
      ) : (
        <>
          <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border px-4 py-1">
            {sorted.map((d) => (
              <Checkbox key={d.id} label={d.name} checked={selected.has(d.id)} disabled={pending} onCheckedChange={(checked) => toggle(d.id, checked)} />
            ))}
          </div>
          <p className="text-xs text-ink-60">{selectedLabel(chosen.length, sorted.length)}</p>
        </>
      )}
    </Dialog>
  )
}

/** ProductAccessDialog: department marks for a product (admin). State is created on open, so each opening starts from the saved set. */
export function ProductAccessDialog({ open, ...rest }: ProductAccessDialogProps) {
  return open ? <Content {...rest} /> : null
}
