import type { ReactNode } from 'react'

function Icon({
  children,
  size,
  className,
}: {
  children: ReactNode
  size: number
  className?: string
}) {
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
      className={className}
    >
      {children}
    </svg>
  )
}

interface IconProps {
  size?: number
  className?: string
}

export const SendIcon = ({ size = 18, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
    <path d="m21.854 2.147-10.94 10.939" />
  </Icon>
)

export const SpinnerIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={`animate-spin ${className ?? ''}`}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </Icon>
)

export const ExternalLinkIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>
)

export const UnlinkIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
    <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
    <path d="M8 2v3M2 8h3M16 19v3M19 16h3" />
  </Icon>
)

export const TimerOffIcon = ({ size = 18, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M10 2h4" />
    <path d="M4.6 11a8 8 0 0 0 1.7 8.7 8 8 0 0 0 8.7 1.7" />
    <path d="M7.4 7.4a8 8 0 0 1 10.3 1 8 8 0 0 1 .9 10.2" />
    <path d="m2 2 20 20" />
    <path d="M12 12v-2" />
  </Icon>
)

export const AlertIcon = ({ size = 18, className }: IconProps) => (
  <Icon size={size} className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
)

export const RetryIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
)

export const RefreshIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Icon>
)

export const BotOffIcon = ({ size = 18, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M13.67 8H18a2 2 0 0 1 2 2v4.33" />
    <path d="M2 14h2M20 14h2" />
    <path d="M22 22 2 2" />
    <path d="M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586" />
    <path d="M9 13v2" />
    <path d="M9.67 4H12v2.33" />
  </Icon>
)
