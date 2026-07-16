import { useSyncExternalStore } from 'react'
import type { BoardState, Card, Status, User } from './types'

/**
 * Persistence layer. Everything the UI touches goes through this module, so
 * swapping localStorage for Supabase later means editing only this file.
 */

const STORAGE_KEY = 'request-board:v1'

const SEED_CARDS: Omit<Card, 'id' | 'createdAt'>[] = [
  { title: 'Landing page hero refresh', description: 'New hero copy + image for the Q3 campaign.', status: 'open' },
  { title: 'Pricing table A/B test', description: 'Set up experiment for the two pricing layouts.', status: 'open' },
  { title: 'Onboarding email sequence', description: 'Draft the 3-email welcome flow.', status: 'in_progress' },
  { title: 'Analytics dashboard cleanup', description: 'Remove stale widgets, fix the funnel chart.', status: 'done' },
]

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function load(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as BoardState
  } catch {
    // fall through to seed
  }
  const now = Date.now()
  const seed: BoardState = {
    users: [],
    currentUserId: null,
    cards: SEED_CARDS.map((c, i) => ({ ...c, id: uid(), createdAt: now + i })),
  }
  return seed
}

let state: BoardState = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private-mode errors
  }
}

function set(next: BoardState) {
  state = next
  persist()
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ---- Selectors (React hook) ----

export function useBoard(): BoardState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

// ---- Users ----

export function claimIdentity(name: string, color: string): User {
  const user: User = { id: uid(), name: name.trim(), color }
  set({ ...state, users: [...state.users, user], currentUserId: user.id })
  return user
}

export function usedColors(): string[] {
  return state.users.map((u) => u.color)
}

export function userById(id: string | null | undefined): User | undefined {
  if (!id) return undefined
  return state.users.find((u) => u.id === id)
}

export function switchUser(id: string) {
  set({ ...state, currentUserId: id })
}

/** Return to the identity picker (add a teammate / switch who you are). */
export function openIdentityPicker() {
  set({ ...state, currentUserId: null })
}

// ---- Cards ----

export function createCard(title: string, description: string): Card {
  const card: Card = {
    id: uid(),
    title: title.trim(),
    description: description.trim(),
    status: 'open',
    createdAt: Date.now(),
  }
  set({ ...state, cards: [card, ...state.cards] })
  return card
}

export function updateCard(id: string, patch: Partial<Pick<Card, 'title' | 'description' | 'status'>>) {
  set({
    ...state,
    cards: state.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  })
}

export function setStatus(id: string, status: Status) {
  updateCard(id, { status })
}

export function submitRequest(cardId: string, requesterId: string, picId: string, notes: string) {
  set({
    ...state,
    cards: state.cards.map((c) =>
      c.id === cardId
        ? { ...c, request: { requesterId, picId, notes: notes.trim(), createdAt: Date.now() } }
        : c,
    ),
  })
}

export function clearRequest(cardId: string) {
  set({
    ...state,
    cards: state.cards.map((c) => {
      if (c.id !== cardId) return c
      const { request: _omit, ...rest } = c
      return rest
    }),
  })
}

/** Open (non-done) cards where the user is requester or PIC. */
export function openRequestsFor(userId: string): Card[] {
  return state.cards.filter(
    (c) =>
      c.status !== 'done' &&
      c.request &&
      (c.request.requesterId === userId || c.request.picId === userId),
  )
}
