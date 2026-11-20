import { DropdownMenu as MenuPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

export const Menu = MenuPrimitive.Root
export const MenuTrigger = MenuPrimitive.Trigger
export const MenuSeparator = (props: ComponentProps<typeof MenuPrimitive.Separator>) => (
  <MenuPrimitive.Separator {...props} className={cn('my-1 h-px bg-border', props.className)} />
)

export function MenuContent({
  className,
  sideOffset = 8,
  align = 'start',
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-[200px] rounded-menu border border-border bg-surface p-1.5 shadow-panel outline-none',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

export function MenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm text-ink outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-alt',
        className,
      )}
      {...props}
    />
  )
}
