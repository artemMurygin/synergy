import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  flexRender
} from '@tanstack/react-table'
import { fetchItems } from './api'
import type { Item } from './schema'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

const col = createColumnHelper<Item>()
const columns = [
  col.accessor('id', { header: 'ID' }),
  col.accessor('name', { header: 'Название' }),
  col.accessor('status', { header: 'Статус' })
]

export function ItemsTable() {
  const { data = [], isLoading } = useQuery({ queryKey: ['items'], queryFn: fetchItems })
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })

  if (isLoading) return <p className="text-muted-foreground">Загрузка…</p>

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((c) => (
              <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
