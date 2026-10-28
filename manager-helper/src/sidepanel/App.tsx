import { useViewportSize } from './use-viewport-size'

export function App() {
  const { widthPx, heightPx } = useViewportSize()

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-500 bg-blue-50 p-4 text-center">
      <h1 className="text-lg font-semibold">Manager Helper</h1>
      <p className="text-3xl font-bold tabular-nums">
        {widthPx} × {heightPx}
      </p>
      <p className="text-sm text-gray-600">ширина × высота side panel, px</p>
    </main>
  )
}
