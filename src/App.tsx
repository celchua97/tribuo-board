import { useMemo, useState, type DragEvent } from 'react'
import type { Card, Status } from './types'
import { STATUSES } from './types'
import { createCard, openIdentityPicker, restoreCard, setStatus, useBoard, userById } from './store'
import {
  formatDueCountdown,
  formatDueDate,
  formatMonthLabel,
  formatPickup,
  formatShortDate,
  isDueSoon,
  isOverdue,
  pickupDays,
} from './dates'
import logoUrl from './assets/tribuo-logo.svg'
import UserBadge from './components/UserBadge'
import Onboarding from './components/Onboarding'
import CardModal from './components/CardModal'

type FilterUser = string | 'all'

export default function App() {
  const board = useBoard()
  const { cards, users, currentUserId } = board
  const currentUser = userById(currentUserId)

  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [requesterFilter, setRequesterFilter] = useState<FilterUser>('all')
  const [picFilter, setPicFilter] = useState<FilterUser>('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (c.archivedAt) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (requesterFilter !== 'all' && c.request?.requesterId !== requesterFilter) return false
      if (picFilter !== 'all' && c.request?.picId !== picFilter) return false
      if (mineOnly) {
        const mine =
          c.request?.requesterId === currentUserId || c.request?.picId === currentUserId
        if (!mine) return false
      }
      return true
    })
  }, [cards, statusFilter, requesterFilter, picFilter, mineOnly, currentUserId])

  const columns = useMemo(() => {
    const map: Record<Status, Card[]> = { todo: [], in_progress: [], review: [], done: [] }
    for (const c of filtered) {
      // Guard against a status value outside the known set (e.g. stale data,
      // a manual DB edit) — fall back to To-do instead of crashing the board.
      const bucket = map[c.status] ?? map.todo
      bucket.push(c)
    }
    return map
  }, [filtered])

  const archivedCards = useMemo(() => cards.filter((c) => c.archivedAt), [cards])

  const archivedByMonth = useMemo(() => {
    const byKey = new Map<string, Card[]>()
    for (const c of archivedCards) {
      const d = new Date(c.createdAt)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(c)
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, monthCards]) => ({ key, label: formatMonthLabel(monthCards[0].createdAt), cards: monthCards }))
  }, [archivedCards])

  if (!board.configured) return <SetupNeeded />
  if (!board.ready) return <Loading />
  if (!currentUser) return <Onboarding />

  const openCard = openCardId ? cards.find((c) => c.id === openCardId) : null

  const addCard = async () => {
    const card = await createCard('New card', '')
    if (card) setOpenCardId(card.id)
  }

  return (
    <div className="app">
      <header className="topbar">
        <img className="brand-logo" src={logoUrl} alt="tribuo" />
        <div className="topbar-right">
          <div className="me">
            <UserBadge user={currentUser} showName />
            <button className="switch-btn" onClick={openIdentityPicker} title="Add or switch teammate">
              Switch
            </button>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <button className="btn-primary" onClick={addCard}>
          + Add card
        </button>

        <div className="filters">
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as Status | 'all')}
            options={[{ value: 'all', label: 'All' }, ...STATUSES.map((s) => ({ value: s.id, label: s.label }))]}
          />
          <FilterSelect
            label="Requester"
            value={requesterFilter}
            onChange={setRequesterFilter}
            options={[{ value: 'all', label: 'All' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          />
          <FilterSelect
            label="PIC"
            value={picFilter}
            onChange={setPicFilter}
            options={[{ value: 'all', label: 'All' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          />
          <button
            type="button"
            className={`mine-toggle${mineOnly ? ' active' : ''}`}
            onClick={() => setMineOnly((v) => !v)}
            style={mineOnly ? { borderColor: currentUser.color, color: currentUser.color } : undefined}
            title="Show only cards where you are requester or PIC"
          >
            <span className="dot" style={{ background: currentUser.color }} />
            Mine
          </button>
        </div>
      </div>

      <div className="board">
        {STATUSES.map((s) => (
          <div
            className={`column${dragOverStatus === s.id ? ' drag-over' : ''}`}
            key={s.id}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverStatus !== s.id) setDragOverStatus(s.id)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              setDragOverStatus(null)
              setDraggingId(null)
              const card = id ? cards.find((c) => c.id === id) : undefined
              if (card && card.status !== s.id) setStatus(id, s.id)
            }}
          >
            <div className={`column-head st-${s.id}`}>
              {s.label}
              <span className="count">{columns[s.id].length}</span>
            </div>
            <div className="column-body">
              {columns[s.id].map((c) => (
                <CardTile
                  key={c.id}
                  card={c}
                  dragging={draggingId === c.id}
                  onOpen={() => setOpenCardId(c.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', c.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingId(c.id)
                  }}
                  onDragEnd={() => {
                    setDraggingId(null)
                    setDragOverStatus(null)
                  }}
                />
              ))}
              {columns[s.id].length === 0 && (
                <div className="column-empty">{dragOverStatus === s.id ? 'Drop here' : 'Nothing here'}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {archivedCards.length > 0 && (
        <div className="history-section">
          <button
            type="button"
            className="history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
          >
            <span className={`history-caret${historyOpen ? ' open' : ''}`} aria-hidden="true">
              ▸
            </span>
            History
            <span className="count">{archivedCards.length}</span>
          </button>
          {historyOpen && (
            <div className="history-body">
              {archivedByMonth.map((group) => (
                <div className="history-group" key={group.key}>
                  <div className="history-month">{group.label}</div>
                  {group.cards.map((c) => (
                    <HistoryRow key={c.id} card={c} onOpen={() => setOpenCardId(c.id)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {openCard && (
        <CardModal
          card={openCard}
          users={users}
          currentUser={currentUser}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="center-screen">
      <div className="spinner" />
      <p>Loading board…</p>
    </div>
  )
}

function SetupNeeded() {
  return (
    <div className="center-screen">
      <div className="setup-card">
        <h1>One step left</h1>
        <p>
          This board needs a Supabase connection. Create a free project, run{' '}
          <code>supabase/schema.sql</code> in its SQL editor, then add a <code>.env</code> file:
        </p>
        <pre>
{`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p className="setup-hint">See <code>.env.example</code> and the README. Restart the dev server after saving.</p>
      </div>
    </div>
  )
}

function CardTile({
  card,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  card: Card
  dragging: boolean
  onOpen: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
}) {
  const requester = userById(card.request?.requesterId)
  const pic = userById(card.request?.picId)
  const overdue = card.dueDate ? isOverdue(card.dueDate, card.status) : false
  const dueSoon = card.dueDate ? isDueSoon(card.dueDate, card.status) : false
  return (
    <div
      className={`card${dragging ? ' dragging' : ''}${pic ? ' has-request' : ''}`}
      style={pic ? { borderLeftColor: pic.color } : undefined}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
    >
      <div className="card-drag-handle" aria-hidden="true">⋮⋮</div>
      <div className="card-title">{card.title}</div>
      {card.description && <div className="card-desc">{card.description}</div>}
      {card.dueDateSetAt && (
        <div className="card-meta">
          <span className="pickup-pill">{formatPickup(pickupDays(card.createdAt, card.dueDateSetAt))}</span>
        </div>
      )}
      {card.request && (
        <div className="card-tags" onClick={(e) => e.stopPropagation()}>
          <UserBadge user={requester} role="Requester" size="sm" />
          <span className="arrow-sm">→</span>
          <UserBadge user={pic} role="PIC" size="sm" />
        </div>
      )}
      {card.dueDate && (
        <div className="card-due-footer">
          <span className={`due-pill${overdue ? ' overdue' : dueSoon ? ' due-soon' : ''}`}>
            {formatDueDate(card.dueDate)} · {formatDueCountdown(card.dueDate)}
          </span>
        </div>
      )}
    </div>
  )
}

function HistoryRow({ card, onOpen }: { card: Card; onOpen: () => void }) {
  return (
    <div
      className="history-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
    >
      <span className="history-row-title">{card.title}</span>
      <span className="history-row-date">
        Archived {card.archivedAt ? formatShortDate(card.archivedAt) : ''}
      </span>
      <button
        type="button"
        className="link-btn"
        onClick={(e) => {
          e.stopPropagation()
          restoreCard(card.id)
        }}
      >
        Restore
      </button>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="filter">
      <span className="filter-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
