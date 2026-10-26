import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/stores/ui.store'
import { ItemsTable } from '@/features/items/ItemsTable'

export default function App() {
  const { dark, toggleDark } = useUiStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Control Center</h1>
        <Button variant="outline" onClick={toggleDark}>
          {dark ? 'Светлая тема' : 'Тёмная тема'}
        </Button>
      </header>
      <ItemsTable />
    </main>
  )
}
