import { useSyncExternalStore } from 'react'
import type { Attachment, BoardState, Card, Comment, Status, User } from './types'
import {
  supabase,
  isConfigured,
  ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_BYTES,
  type AttachmentRow,
  type CardRow,
  type CommentRow,
  type UserRow,
} from './supabase'

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
  attachments: {},
  comments: {},
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
    dueDate: r.due_date,
    dueDateSetAt: r.due_date_set_at ? Date.parse(r.due_date_set_at) : null,
    archivedAt: r.archived_at ? Date.parse(r.archived_at) : null,
  }
  if (r.requester_id) {
    card.request = {
      requesterId: r.requester_id,
      picIds: r.pic_ids ?? [],
      notes: r.notes ?? '',
      createdAt: r.requested_at ? Date.parse(r.requested_at) : card.createdAt,
    }
  }
  return card
}

function mapAttachment(r: AttachmentRow): Attachment {
  return {
    id: r.id,
    cardId: r.card_id,
    kind: r.kind as 'file' | 'link',
    name: r.name,
    url: r.url,
    mimeType: r.mime_type,
    storagePath: r.storage_path,
    addedBy: r.added_by,
    createdAt: Date.parse(r.created_at),
  }
}

function mapComment(r: CommentRow): Comment {
  return {
    id: r.id,
    cardId: r.card_id,
    authorId: r.author_id,
    body: r.body,
    createdAt: Date.parse(r.created_at),
  }
}

// ---- Hydration + realtime ----

async function refetch() {
  if (!supabase) return
  const [usersRes, cardsRes, attachmentsRes, commentsRes] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: true }),
    supabase.from('cards').select('*').order('created_at', { ascending: false }),
    supabase.from('attachments').select('*').order('created_at', { ascending: true }),
    supabase.from('comments').select('*').order('created_at', { ascending: true }),
  ])

  const users = (usersRes.data as UserRow[] | null)?.map(mapUser) ?? state.users
  const cards = (cardsRes.data as CardRow[] | null)?.map(mapCard) ?? state.cards
  const attachmentRows = (attachmentsRes.data as AttachmentRow[] | null)?.map(mapAttachment)
  let attachments = state.attachments
  if (attachmentRows) {
    const grouped: Record<string, Attachment[]> = {}
    for (const a of attachmentRows) {
      if (!grouped[a.cardId]) grouped[a.cardId] = []
      grouped[a.cardId].push(a)
    }
    attachments = grouped
  }
  const commentRows = (commentsRes.data as CommentRow[] | null)?.map(mapComment)
  let comments = state.comments
  if (commentRows) {
    const grouped: Record<string, Comment[]> = {}
    for (const c of commentRows) {
      if (!grouped[c.cardId]) grouped[c.cardId] = []
      grouped[c.cardId].push(c)
    }
    comments = grouped
  }

  // Drop a stale current-user id only if that user was actually removed from a
  // non-empty user list (avoids nulling it out on a transient empty response).
  const stillExists = users.some((u) => u.id === state.currentUserId)
  const currentUserId =
    state.currentUserId && users.length > 0 && !stillExists ? null : state.currentUserId
  if (currentUserId !== state.currentUserId) saveCurrentUserId(currentUserId)

  set({ users, cards, attachments, comments, currentUserId, ready: true })
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments' }, () => refetch())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => refetch())
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

export async function createCard(title: string, description: string): Promise<Card | null> {
  if (!supabase) return null
  const t = title.trim() || 'New card'
  const { data, error } = await supabase
    .from('cards')
    .insert({ title: t, description: description.trim(), status: 'todo' })
    .select()
    .single()
  if (error) {
    console.error('Failed to create card:', error.message)
    return null
  }
  if (!data) return null
  const card = mapCard(data as CardRow)
  set({ cards: [card, ...state.cards] })
  return card
}

/**
 * Every write below applies its change optimistically, then confirms against
 * Supabase. If the write fails (RLS denial, network drop), the optimistic
 * state would otherwise diverge from the server forever with no feedback —
 * so on error we log it and refetch to self-heal back to server truth.
 */
async function writeCards(
  optimisticCards: Card[],
  op: () => PromiseLike<{ error: { message: string } | null }>,
  failureContext: string,
) {
  set({ cards: optimisticCards })
  const { error } = await op()
  if (error) {
    console.error(`${failureContext}:`, error.message)
    refetch()
  }
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<Card, 'title' | 'description' | 'status'>>,
): Promise<void> {
  if (!supabase) return
  const client = supabase
  await writeCards(
    state.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    () => client.from('cards').update(patch).eq('id', id),
    'Failed to update card, re-syncing from server',
  )
}

export function setStatus(id: string, status: Status) {
  return updateCard(id, { status })
}

/**
 * Due date is freely adjustable by anyone at any time. due_date_set_at is
 * only stamped the first time a due date goes from unset -> set, so it stays
 * a stable "time to pickup" marker even as the date itself gets rescheduled.
 */
export async function setDueDate(id: string, dueDate: string | null): Promise<void> {
  if (!supabase) return
  const client = supabase
  const card = state.cards.find((c) => c.id === id)
  const firstAssignment = Boolean(dueDate) && card && !card.dueDateSetAt
  const dueDateSetAtIso = firstAssignment ? new Date().toISOString() : null
  const patch: { due_date: string | null; due_date_set_at?: string } = { due_date: dueDate }
  if (dueDateSetAtIso) patch.due_date_set_at = dueDateSetAtIso

  await writeCards(
    state.cards.map((c) =>
      c.id === id
        ? { ...c, dueDate, dueDateSetAt: dueDateSetAtIso ? Date.parse(dueDateSetAtIso) : c.dueDateSetAt }
        : c,
    ),
    () => client.from('cards').update(patch).eq('id', id),
    'Failed to update due date, re-syncing from server',
  )
}

/** Move a Done card into History. */
export async function archiveCard(id: string): Promise<void> {
  if (!supabase) return
  const client = supabase
  const archived_at = new Date().toISOString()
  await writeCards(
    state.cards.map((c) => (c.id === id ? { ...c, archivedAt: Date.parse(archived_at) } : c)),
    () => client.from('cards').update({ archived_at }).eq('id', id),
    'Failed to archive card, re-syncing from server',
  )
}

/** Bring an archived card back onto the board. */
export async function restoreCard(id: string): Promise<void> {
  if (!supabase) return
  const client = supabase
  await writeCards(
    state.cards.map((c) => (c.id === id ? { ...c, archivedAt: null } : c)),
    () => client.from('cards').update({ archived_at: null }).eq('id', id),
    'Failed to restore card, re-syncing from server',
  )
}

export async function deleteCard(id: string): Promise<void> {
  if (!supabase) return
  const client = supabase

  // The DB cascades attachment ROWS on card delete, but not their storage
  // OBJECTS — clean those up first so deleted cards don't leak storage quota.
  const filePaths = (state.attachments[id] ?? [])
    .filter((a) => a.kind === 'file' && a.storagePath)
    .map((a) => a.storagePath as string)
  if (filePaths.length > 0) {
    const { error: storageError } = await client.storage.from(ATTACHMENTS_BUCKET).remove(filePaths)
    if (storageError) console.error('Failed to delete some attachment files:', storageError.message)
  }

  await writeCards(
    state.cards.filter((c) => c.id !== id),
    () => client.from('cards').delete().eq('id', id),
    'Failed to delete card, re-syncing from server',
  )

  if (state.attachments[id]) {
    const { [id]: _omit, ...rest } = state.attachments
    set({ attachments: rest })
  }
  if (state.comments[id]) {
    const { [id]: _omit, ...rest } = state.comments
    set({ comments: rest })
  }
}

export async function submitRequest(
  cardId: string,
  requesterId: string,
  picIds: string[],
  notes: string,
): Promise<void> {
  if (!supabase) return
  const client = supabase
  const requested_at = new Date().toISOString()
  await writeCards(
    state.cards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            request: { requesterId, picIds, notes: notes.trim(), createdAt: Date.parse(requested_at) },
          }
        : c,
    ),
    () =>
      client
        .from('cards')
        .update({ requester_id: requesterId, pic_ids: picIds, notes: notes.trim(), requested_at })
        .eq('id', cardId),
    'Failed to submit request, re-syncing from server',
  )
}

export async function clearRequest(cardId: string): Promise<void> {
  if (!supabase) return
  const client = supabase
  await writeCards(
    state.cards.map((c) => {
      if (c.id !== cardId) return c
      const { request: _omit, ...rest } = c
      return rest
    }),
    () =>
      client
        .from('cards')
        .update({ requester_id: null, pic_ids: [], notes: '', requested_at: null })
        .eq('id', cardId),
    'Failed to withdraw request, re-syncing from server',
  )
}

/** Open (non-done) cards where the user is requester or PIC. */
export function openRequestsFor(userId: string): Card[] {
  return state.cards.filter(
    (c) =>
      c.status !== 'done' &&
      c.request &&
      (c.request.requesterId === userId || c.request.picIds.includes(userId)),
  )
}

// ---- Attachments ----

export function attachmentsFor(cardId: string): Attachment[] {
  return state.attachments[cardId] ?? []
}

function addAttachmentToState(attachment: Attachment) {
  set({
    attachments: {
      ...state.attachments,
      [attachment.cardId]: [...(state.attachments[attachment.cardId] ?? []), attachment],
    },
  })
}

export async function addLinkAttachment(
  cardId: string,
  url: string,
  label: string,
  addedBy: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const trimmed = url.trim()
  if (!trimmed) return { error: 'Enter a URL.' }
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const { data, error } = await supabase
    .from('attachments')
    .insert({ card_id: cardId, kind: 'link', name: label.trim() || href, url: href, added_by: addedBy })
    .select()
    .single()
  if (error) {
    console.error('Failed to add link:', error.message)
    return { error: error.message }
  }
  if (data) addAttachmentToState(mapAttachment(data as AttachmentRow))
  return {}
}

export async function uploadFileAttachment(
  cardId: string,
  file: File,
  addedBy: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: `File is too large (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).` }
  }
  const client = supabase
  const path = `${cardId}/${crypto.randomUUID()}-${file.name}`

  const { error: uploadError } = await client.storage.from(ATTACHMENTS_BUCKET).upload(path, file)
  if (uploadError) {
    console.error('Failed to upload file:', uploadError.message)
    return { error: uploadError.message }
  }

  const { data: pub } = client.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path)
  const { data, error } = await client
    .from('attachments')
    .insert({
      card_id: cardId,
      kind: 'file',
      name: file.name,
      url: pub.publicUrl,
      mime_type: file.type || null,
      storage_path: path,
      added_by: addedBy,
    })
    .select()
    .single()
  if (error) {
    console.error('Failed to save attachment record:', error.message)
    await client.storage.from(ATTACHMENTS_BUCKET).remove([path]) // avoid an orphaned upload
    return { error: error.message }
  }
  if (data) addAttachmentToState(mapAttachment(data as AttachmentRow))
  return {}
}

export async function removeAttachment(attachment: Attachment): Promise<void> {
  if (!supabase) return
  const client = supabase
  set({
    attachments: {
      ...state.attachments,
      [attachment.cardId]: (state.attachments[attachment.cardId] ?? []).filter(
        (a) => a.id !== attachment.id,
      ),
    },
  })
  const { error } = await client.from('attachments').delete().eq('id', attachment.id)
  if (error) {
    console.error('Failed to remove attachment, re-syncing from server:', error.message)
    refetch()
    return
  }
  if (attachment.kind === 'file' && attachment.storagePath) {
    const { error: storageError } = await client.storage
      .from(ATTACHMENTS_BUCKET)
      .remove([attachment.storagePath])
    if (storageError) {
      console.error('Failed to delete storage object (row already removed):', storageError.message)
    }
  }
}

// ---- Comments ----

export function commentsFor(cardId: string): Comment[] {
  return state.comments[cardId] ?? []
}

export async function addComment(
  cardId: string,
  authorId: string,
  body: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Not configured' }
  const trimmed = body.trim()
  if (!trimmed) return { error: 'Write something first.' }
  const { data, error } = await supabase
    .from('comments')
    .insert({ card_id: cardId, author_id: authorId, body: trimmed })
    .select()
    .single()
  if (error) {
    console.error('Failed to post comment:', error.message)
    return { error: error.message }
  }
  if (data) {
    const comment = mapComment(data as CommentRow)
    set({
      comments: {
        ...state.comments,
        [cardId]: [...(state.comments[cardId] ?? []), comment],
      },
    })
  }
  return {}
}

export async function removeComment(comment: Comment): Promise<void> {
  if (!supabase) return
  const client = supabase
  set({
    comments: {
      ...state.comments,
      [comment.cardId]: (state.comments[comment.cardId] ?? []).filter((c) => c.id !== comment.id),
    },
  })
  const { error } = await client.from('comments').delete().eq('id', comment.id)
  if (error) {
    console.error('Failed to remove comment, re-syncing from server:', error.message)
    refetch()
  }
}
