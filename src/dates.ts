import type { Status } from './types'

/** Parse a YYYY-MM-DD date-only string as local time (avoids UTC off-by-one). */
function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDueDate(iso: string): string {
  return parseDateOnly(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function isOverdue(dueDate: string, status: Status): boolean {
  if (status === 'done') return false
  const due = parseDateOnly(dueDate)
  due.setHours(23, 59, 59, 999) // overdue only once the whole due day has passed
  return due.getTime() < Date.now()
}

export function isDueSoon(dueDate: string, status: Status): boolean {
  if (status === 'done' || isOverdue(dueDate, status)) return false
  const diffDays = (parseDateOnly(dueDate).getTime() - Date.now()) / 86_400_000
  return diffDays <= 2
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole days from today to the due date (negative once it's past). */
export function daysUntilDue(dueDate: string): number {
  return Math.round((parseDateOnly(dueDate).getTime() - startOfToday().getTime()) / 86_400_000)
}

export function formatDueCountdown(dueDate: string): string {
  const days = daysUntilDue(dueDate)
  if (days === 0) return 'due today'
  if (days > 0) return days === 1 ? '1 day left' : `${days} days left`
  const overdue = Math.abs(days)
  return overdue === 1 ? '1 day overdue' : `${overdue} days overdue`
}

/** Days between card creation and the first time a due date was assigned. */
export function pickupDays(createdAt: number, dueDateSetAt: number): number {
  return Math.max(0, Math.round((dueDateSetAt - createdAt) / 86_400_000))
}

export function formatPickup(days: number): string {
  if (days === 0) return 'Picked up same day'
  if (days === 1) return 'Picked up in 1 day'
  return `Picked up in ${days} days`
}

export function formatMonthLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
