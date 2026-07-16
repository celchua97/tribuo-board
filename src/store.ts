import { useSyncExternalStore } from 'react'
import type { BoardState, Card, Status, User } from './types'
import { supabase, isConfigured, type CardRow, type UserRow } from './supabase'

/**
 * Persistence layer, backed by Supabase.
 *
 * The UI reads synchronously from an in-memory cache (`state`) via `useBoard()`,
 * exactly as before. That cache is hydrated from Supabase on load and kept in
 * sync through Postgres realtime — any insert/update/delete triggers a refetch.
 * Mutations write to Supabase and optimistically patch the cache for snappy UX;
 * realtime then reconciles every client (including this one) to server truth.
 *
 * "Who am I" is a per-browser concept, so `currentUserId` lives in localStorage,
 * not in the shared database.
 */

const CURRENT_USER_KEY = 'request-board:currentUserId'

function loadCurrentUserId(): string | null {
  try {
    return localStorage.getItem(CURRENT_USER_KEY)
  } catch {
    return null
  }
}

function saveCurrentUserId(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_USER_KEY, id)
    else localStorage.removeItem(CURRENT_USER_KEY)
  } catch {
    // ignore private-mode / quota errors
  }
}

let state: BoardState = {
  users: [],
  cards: [],
  currentUserId: loadCurrentUserId(),
  ready: false,
  configured: isConfigured,
}

const listeners = new Set<() => void>()

function set(next: Partial<BoardState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ---- Row <-> app-type mapping ----

function mapUser(r: UserRow): User {
  return { id: r.id, name: r.name, color: r.color }
}

function mapCard(r: CardRow): Card {
  const card: Card = {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    status: r.status as Status,
    createdAt: Date.parse(r.created_at),
  }
  if (r.requester_id) {
    card.request = {
      requesterId: r.requester_id,
      picId: r.pic_id ?? '',
      notes: r.notes ?? '',
      createdAt: r.requested_at ? Date.parse(r.requested_at) : card.createdAt,
    }
  }
  return card
}

// ---- Hydration + realtime ----

async function refetch() {
  if (!supabase) return
  const [usersRes, cardsRes] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: true }),
    supabase.from('cards').select('*').order('created_at', { ascending: false }),
  ])

  const users = (usersRes.data as UserRow[] | null)?.map(mapUser) ?? state.users
  const cards = (cardsRes.data as CardRow[] | null)?.map(mapCard) ?? state.cards

  // Drop a stale current-user id only if that user was actually removed from a
  // non-empty user list (avoids nulling it out on a transient empty response).
  const stillExists = users.some((u) => u.id === state.currentUserId)
  const currentUserId =
    state.currentUserId && users.length > 0 && !stillExists ? null : state.currentUserId
  if (currentUserId !== state.currentUserId) saveCurrentUserId(currentUserId)

  set({ users, cards, currentUserId, ready: true })
}

let started = false

export function initStore() {
  if (started || !supabase) {
    if (!supabase) set({ ready: true }) // unconfigured: let the UI show setup help
    return
  }
  started = true

  refetch()

  supabase
    .channel('board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => refetch())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => refetch())
    .subscribe()
}

// ---- Selectors (React hook) ----

export function useBoard(): BoardState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

// ---- Users ----

/**
 * Claim a unique color + name. Resolves to the new user, or throws if the color
 * was taken in a race (enforced by a UNIQUE constraint on users.color).
 */
export async function claimIdentity(name: string, color: string): Promise<User> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('users')
    .insert({ name: name.trim(), color })
    .select()
    .single()
  if (error || !data) {
    throw new Error(
      error?.code === '23505'
        ? 'That color was just taken — pick another.'
        : error?.message ?? 'Could not join the board.',
    )
  }
  const user = mapUser(data as UserRow)
  saveCurrentUserId(user.id)
  set({ users: [...state.users, user], currentUserId: user.id })
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
  saveCurrentUserId(id)
  set({ currentUserId: id })
}

/** Return to the identity picker (add a teammate / switch who you are). */
export function openIdentityPicker() {
  saveCurrentUserId(null)
  set({ currentUserId: null })
}

// ---- Cards ----

export async function createCard(title: string, description: string): Promise<void> {
  if (!supabase) return
  const t = title.trim()
  if (!t) return
  const { data } = await supabase
    .from('cards')
    .insert({ title: t, description: description.trim(), status: 'todo' })
    .select()
    .single()
  if (data) set({ cards: [mapCard(data as CardRow), ...state.cards] })
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<Card, 'title' | 'description' | 'status'>>,
): Promise<void> {
  if (!supabase) return
  // Optimistic local patch.
  set({ cards: state.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  await supabase.from('cards').update(patch).eq('id', id)
}

export function setStatus(id: string, status: Status) {
  return updateCard(id, { status })
}

export async function deleteCard(id: string): Promise<void> {
  if (!supabase) return
  // Optimistic removal; realtime confirms for every other client.
  set({ cards: state.cards.filter((c) => c.id !== id) })
  await supabase.from('cards').delete().eq('id', id)
}

export async function submitRequest(
  cardId: string,
  requesterId: string,
  picId: string,
  notes: string,
): Promise<void> {
  if (!supabase) return
  const requested_at = new Date().toISOString()
  set({
    cards: state.cards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            request: { requesterId, picId, notes: notes.trim(), createdAt: Date.parse(requested_at) },
          }
        : c,
    ),
  })
  await supabase
    .from('cards')
    .update({ requester_id: requesterId, pic_id: picId, notes: notes.trim(), requested_at })
    .eq('id', cardId)
}

export async function clearRequest(cardId: string): Promise<void> {
  if (!supabase) return
  set({
    cards: state.cards.map((c) => {
      if (c.id !== cardId) return c
      const { request: _omit, ...rest } = c
      return rest
    }),
  })
  await supabase
    .from('cards')
    .update({ requester_id: null, pic_id: null, notes: '', requested_at: null })
    .eq('id', cardId)
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
