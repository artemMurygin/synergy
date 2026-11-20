/** Обратный отсчёт «м:сс». */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60))}:${String(safe % 60).padStart(2, '0')}`
}
