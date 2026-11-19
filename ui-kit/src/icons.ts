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
export const AlarmClock = wrap(lucide.AlarmClock)
export const ArrowUpDown = wrap(lucide.ArrowUpDown)
export const Calendar = wrap(lucide.Calendar)
export const CircleAlert = wrap(lucide.CircleAlert)
export const CircleCheck = wrap(lucide.CircleCheck)
export const CloudOff = wrap(lucide.CloudOff)
export const FileText = wrap(lucide.FileText)
export const FileX = wrap(lucide.FileX)
export const User = wrap(lucide.User)
export const Users = wrap(lucide.Users)
export const Lock = wrap(lucide.Lock)
export const Server = wrap(lucide.Server)
export const TriangleAlert = wrap(lucide.TriangleAlert)
export const Clock = wrap(lucide.Clock)
export const Copy = wrap(lucide.Copy)
export const Unlink = wrap(lucide.Unlink)
export const Loader = wrap(lucide.LoaderCircle)
export const RefreshCw = wrap(lucide.RefreshCw)
export const CheckCheck = wrap(lucide.CheckCheck)
export const WifiOff = wrap(lucide.WifiOff)
export const KeyRound = wrap(lucide.KeyRound)
export const BellOff = wrap(lucide.BellOff)
export const ArrowDown = wrap(lucide.ArrowDown)
export const ArrowUp = wrap(lucide.ArrowUp)
export const AudioLines = wrap(lucide.AudioLines)
export const Info = wrap(lucide.Info)
export const PanelLeftClose = wrap(lucide.PanelLeftClose)
export const PanelLeftOpen = wrap(lucide.PanelLeftOpen)
export const RotateCw = wrap(lucide.RotateCw)
export const Square = wrap(lucide.Square)
export const MessagesSquare = wrap(lucide.MessagesSquare)
export const Sparkles = wrap(lucide.Sparkles)
export const ChevronUp = wrap(lucide.ChevronUp)
