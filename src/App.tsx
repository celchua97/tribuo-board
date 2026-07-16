import { useMemo, useState } from 'react'
import type { Card, Status } from './types'
import { STATUSES } from './types'
import { createCard, openIdentityPicker, useBoard, userById } from './store'
import UserBadge from './components/UserBadge'
import Onboarding from './components/Onboarding'
import CardModal from './components/CardModal'

type FilterUser = string | 'all'

export default function App() {
  const { cards, users, currentUserId } = useBoard()
  const currentUser = userById(currentUserId)

  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [requesterFilter, setRequesterFilter] = useState<FilterUser>('all')
  const [picFilter, setPicFilter] = useState<FilterUser>('all')

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (requesterFilter !== 'all' && c.request?.requesterId !== requesterFilter) return false
      if (picFilter !== 'all' && c.request?.picId !== picFilter) return false
      return true
    })
  }, [cards, statusFilter, requesterFilter, picFilter])

  const columns = useMemo(() => {
    const map: Record<Status, Card[]> = { open: [], in_progress: [], done: [] }
    for (const c of filtered) map[c.status].push(c)
    return map
  }, [filtered])

  if (!currentUser) return <Onboarding />

  const openCard = openCardId ? cards.find((c) => c.id === openCardId) : null

  const addCard = () => {
    if (!newTitle.trim()) return
    createCard(newTitle, '')
    setNewTitle('')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          Request Board
        </div>
        <div className="topbar-right">
          <div className="active-users">
            {users.map((u) => (
              <UserBadge key={u.id} user={u} size="sm" />
            ))}
          </div>
          <div className="me">
            <UserBadge user={currentUser} showName />
            <button className="switch-btn" onClick={openIdentityPicker} title="Add or switch teammate">
              Switch
            </button>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="new-card">
          <input
            className="text-input"
            placeholder="New card title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCard()}
          />
          <button className="btn-primary" onClick={addCard}>
            Add
          </button>
        </div>

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
        </div>
      </div>

      <div className="board">
        {STATUSES.map((s) => (
          <div className="column" key={s.id}>
            <div className={`column-head st-${s.id}`}>
              {s.label}
              <span className="count">{columns[s.id].length}</span>
            </div>
            <div className="column-body">
              {columns[s.id].map((c) => (
                <CardTile key={c.id} card={c} onOpen={() => setOpenCardId(c.id)} />
              ))}
              {columns[s.id].length === 0 && <div className="column-empty">Nothing here</div>}
            </div>
          </div>
        ))}
      </div>

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

function CardTile({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const requester = userById(card.request?.requesterId)
  const pic = userById(card.request?.picId)
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
    >
      <div className="card-title">{card.title}</div>
      {card.description && <div className="card-desc">{card.description}</div>}
      {card.request && (
        <div className="card-tags" onClick={(e) => e.stopPropagation()}>
          <UserBadge user={requester} role="Requester" size="sm" />
          <span className="arrow-sm">→</span>
          <UserBadge user={pic} role="PIC" size="sm" />
        </div>
      )}
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
