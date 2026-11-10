import type { ReactNode } from 'react'

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const ListIcon = () => (
  <Icon>
    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
    <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
  </Icon>
)
export const ArrowLeftIcon = () => (
  <Icon>
    <path d="m12 19-7-7 7-7M19 12H5" />
  </Icon>
)
export const PlusIcon = () => (
  <Icon>
    <path d="M5 12h14M12 5v14" />
  </Icon>
)
export const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
)
export const PencilIcon = () => (
  <Icon size={16}>
    <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </Icon>
)
export const TrashIcon = () => (
  <Icon size={16}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  </Icon>
)
export const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)
export const CloseIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
)
export const ChatsIcon = () => (
  <Icon size={36}>
    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
    <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
  </Icon>
)
export const CloudOffIcon = ({ size = 36 }: { size?: number }) => (
  <Icon size={size}>
    <path d="m2 2 20 20M5.8 5.8A7 7 0 0 0 7 19h10.5a4.5 4.5 0 0 0 1.4-.2M9.2 4.5A7 7 0 0 1 19 11a4.5 4.5 0 0 1 3 4" />
  </Icon>
)
export const AlertCircleIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
)
export const SquareIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </Icon>
)
export const LoaderIcon = () => (
  <Icon>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </Icon>
)
export const CalendarIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M8 2v4M16 2v4M3 10h18" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
  </Icon>
)
export const AlarmIcon = () => (
  <Icon size={14}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3" />
  </Icon>
)
export const ClockIcon = () => (
  <Icon size={14}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Icon>
)
export const DownloadIcon = () => (
  <Icon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Icon>
)
export const FileIcon = () => (
  <Icon size={20}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4M10 13H8M16 17H8" />
  </Icon>
)
export const SlidersIcon = () => (
  <Icon size={16}>
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
  </Icon>
)
export const ChevronRightIcon = () => (
  <Icon size={16}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
)
export const ChevronDownIcon = () => (
  <Icon size={16}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)
export const CircleCheckIcon = () => (
  <Icon size={24}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
)
export const SortAscIcon = () => (
  <Icon size={14}>
    <path d="m3 8 4-4 4 4M7 4v16M11 12h4M11 16h7M11 20h10" />
  </Icon>
)
export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </Icon>
)
export const UsersIcon = () => (
  <Icon>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
)
export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41M17.66 6.34l1.41-1.41M2 12h2m16 0h2M6.34 6.34 4.93 4.93m14.14 14.14-1.41-1.41" />
  </Icon>
)
export const SunriseIcon = () => (
  <Icon>
    <path d="M12 2v8m-7.07.93 1.41 1.41M2 18h2m16 0h2m-2.93-7.07-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0" />
  </Icon>
)
export const CalendarDaysIcon = () => (
  <Icon>
    <path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
  </Icon>
)
export const CalendarXIcon = () => (
  <Icon>
    <path d="M8 2v4M16 2v4M3 10h18m-11 4 4 4m0-4-4 4" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
  </Icon>
)
export const CalendarClockIcon = () => (
  <Icon>
    <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M16 2v4M8 2v4M3 10h5M17.5 17.5 16 16.3V14" />
    <circle cx="16" cy="16" r="6" />
  </Icon>
)
