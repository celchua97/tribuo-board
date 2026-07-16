export type Status = 'open' | 'in_progress' | 'done'

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
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
}

export interface BoardState {
  users: User[]
  cards: Card[]
  currentUserId: string | null
}
