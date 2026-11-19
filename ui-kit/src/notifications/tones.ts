export type NotificationTone = 'brand' | 'info' | 'warning' | 'success'

/** Фон и цвет иконки типа уведомления (макеты aXdYi, fpEyH). */
export const toneClasses: Record<NotificationTone, string> = {
  brand: 'bg-brand-red-soft text-brand-red',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
}
