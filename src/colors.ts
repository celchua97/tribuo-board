/**
 * A curated palette of visually distinct identity colors.
 * Each active user claims exactly one — no two active users share a color.
 *
 * Sourced strictly from the Tribuo brandbook's primary + secondary palette
 * (no off-brand hues) — every entry here is one of those exact hex values.
 * Brand yellow (#f9c339) is deliberately left out: it's reserved as
 * MULTI_PIC_COLOR below, so a yellow swatch always and only means "shared".
 */
export const PALETTE: { hex: string; name: string }[] = [
  { hex: '#3750AB', name: 'Blue' },
  { hex: '#FD947A', name: 'Coral' },
  { hex: '#980000', name: 'Crimson' },
  { hex: '#FF751F', name: 'Orange' },
  { hex: '#EEAFA8', name: 'Blush' },
  { hex: '#6F9FC8', name: 'Sky' },
  { hex: '#050505', name: 'Ink' },
]

/**
 * Reserved indicator color — not a user identity color, never selectable at
 * onboarding. Shown on a card/badge whenever more than one PIC is assigned,
 * since a single identity swatch can no longer represent "who's on it".
 * Brand secondary yellow (#f9c339).
 */
export const MULTI_PIC_COLOR = '#F9C339'

/** Pick a readable text color (black/white) for a given background hex. */
export function textOn(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  // Perceived luminance (sRGB approximation).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff'
}
