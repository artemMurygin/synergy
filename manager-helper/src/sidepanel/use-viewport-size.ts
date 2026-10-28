import { useEffect, useState } from 'react'

interface ViewportSize {
  widthPx: number
  heightPx: number
}

function readViewportSize(): ViewportSize {
  return { widthPx: window.innerWidth, heightPx: window.innerHeight }
}

export function useViewportSize(): ViewportSize {
  const [viewportSize, setViewportSize] = useState(readViewportSize)

  useEffect(() => {
    const handleResize = () => {
      setViewportSize(readViewportSize())
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return viewportSize
}
