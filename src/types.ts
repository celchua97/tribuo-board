export type Status = 'todo' | 'in_progress' | 'review' | 'done'

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'todo', label: 'To-do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

export interface User {
  id: string
  name: string
  /** Hex color — this IS the user's identity on the board. */
  color: string
}

export interface CardRequest {
  requesterId: string
  picId: string
  notes: string
  createdAt: number
}

export interface Card {
  id: string
  title: string
  description: string
  status: Status
  createdAt: number
  /** Present only once a request has been submitted on this card. */
  request?: CardRequest
  /** ISO date string (YYYY-MM-DD), adjustable by anyone at any time. */
  dueDate: string | null
  /** Stamped the first time a due date is assigned; never reset by later edits. */
  dueDateSetAt: number | null
  /** Set when a Done card is manually moved to History. */
  archivedAt: number | null
}

export interface Attachment {
  id: string
  cardId: string
  kind: 'file' | 'link'
  name: string
  url: string
  mimeType: string | null
  /** Storage object path; null for 'link' attachments. */
  storagePath: string | null
  addedBy: string | null
  createdAt: number
}

export interface BoardState {
  users: User[]
  cards: Card[]
  /** Keyed by card id. */
  attachments: Record<string, Attachment[]>
  currentUserId: string | null
  /** False until the first load from Supabase completes. */
  ready: boolean
  /** False when Supabase env vars are missing (see .env.example). */
  configured: boolean
}
