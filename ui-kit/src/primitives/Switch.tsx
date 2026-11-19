import { Switch as SwitchPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-border-strong p-[3px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50 data-[state=checked]:bg-brand-red',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] rounded-full bg-white shadow-[0_1px_3px_#00000026] transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  )
}
