import { useEffect, useRef } from 'react'
import { onPendingTargetChanged, takePendingTarget } from '@/shared/notifications/pending-target'
import type { PendingTarget } from '@/shared/notifications/pending-target'

export function usePendingTarget(
  onTarget: (target: PendingTarget) => void,
  isEnabled: boolean,
): void {
  const onTargetRef = useRef(onTarget)

  useEffect(() => {
    onTargetRef.current = onTarget
  }, [onTarget])

  useEffect(() => {
    if (!isEnabled) return
    let isActive = true
    const consume = (): void => {
      void takePendingTarget().then((target) => {
        if (isActive && target !== null) onTargetRef.current(target)
      })
    }
    consume()
    const unsubscribe = onPendingTargetChanged(consume)
    return () => {
      isActive = false
      unsubscribe()
    }
  }, [isEnabled])
}
