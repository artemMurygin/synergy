import { createElement, type ComponentType } from 'react'
import * as lucide from 'lucide-react'
import type { LucideProps } from 'lucide-react'

export type IconProps = LucideProps

const DEFAULTS: LucideProps = { size: 18, strokeWidth: 2, 'aria-hidden': true }

function wrap(Icon: ComponentType<LucideProps>): ComponentType<LucideProps> {
  const Wrapped = (props: LucideProps) => createElement(Icon, { ...DEFAULTS, ...props })
  Wrapped.displayName = `Icon(${Icon.displayName ?? 'lucide'})`
  return Wrapped
}

export const Bell = wrap(lucide.Bell)
export const Check = wrap(lucide.Check)
export const ChevronLeft = wrap(lucide.ChevronLeft)
export const ChevronRight = wrap(lucide.ChevronRight)
export const ChevronDown = wrap(lucide.ChevronDown)
export const Download = wrap(lucide.Download)
export const LogOut = wrap(lucide.LogOut)
export const MessageSquare = wrap(lucide.MessageSquare)
export const Paperclip = wrap(lucide.Paperclip)
export const Pencil = wrap(lucide.Pencil)
export const Plus = wrap(lucide.Plus)
export const Search = wrap(lucide.Search)
export const Send = wrap(lucide.Send)
export const Trash2 = wrap(lucide.Trash2)
export const X = wrap(lucide.X)
export const ListChecks = wrap(lucide.ListChecks)
export const Eye = wrap(lucide.Eye)
export const EyeOff = wrap(lucide.EyeOff)
