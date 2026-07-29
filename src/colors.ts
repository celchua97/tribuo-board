/**
 * A curated palette of visually distinct identity colors.
 * Each active user claims exactly one — no two active users share a color.
 */
export const PALETTE: { hex: string; name: string }[] = [
  { hex: '#E4572E', name: 'Ember' },
  { hex: '#F3A712', name: 'Amber' },
  { hex: '#3CB371', name: 'Fern' },
  { hex: '#2D9CDB', name: 'Sky' },
  { hex: '#6C5CE7', name: 'Iris' },
  { hex: '#D6336C', name: 'Rose' },
  { hex: '#00A896', name: 'Teal' },
  { hex: '#8D6E63', name: 'Clay' },
  { hex: '#F25F5C', name: 'Coral' },
  { hex: '#5F6CAF', name: 'Indigo' },
  { hex: '#3A7D44', name: 'Pine' },
  { hex: '#C9184A', name: 'Cherry' },
]

/**
 * Reserved indicator color — not a user identity color, never selectable at
 * onboarding. Shown on a card/badge whenever more than one PIC is assigned,
 * since a single identity swatch can no longer represent "who's on it".
 */
export const MULTI_PIC_COLOR = '#FFD400'

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
