import { useEffect, useState } from 'react'
import type { Card, Status, User } from '../types'
import { STATUSES } from '../types'
import { textOn } from '../colors'
import { clearRequest, deleteCard, submitRequest, updateCard, userById } from '../store'
import UserBadge from './UserBadge'

interface Props {
  card: Card
  users: User[]
  currentUser: User
  onClose: () => void
}

export default function CardModal({ card, users, currentUser, onClose }: Props) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [picId, setPicId] = useState<string>(users.find((u) => u.id !== currentUser.id)?.id ?? '')
  const [notes, setNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Re-sync if the card changes under us (e.g. another user edits it via
  // realtime while this modal is open) so a blur-save can't clobber their
  // update with our stale local buffer.
  useEffect(() => {
    setTitle(card.title)
    setDescription(card.description)
  }, [card.title, card.description])

  const requester = userById(card.request?.requesterId)
  const pic = userById(card.request?.picId)

  const saveDetails = () => updateCard(card.id, { title, description })

  const submit = () => {
    if (!picId) return
    submitRequest(card.id, currentUser.id, picId, notes)
    setShowRequestForm(false)
    setNotes('')
  }

  const remove = () => {
    deleteCard(card.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-wrap">
            <label className="field-label" htmlFor="card-title-input">
              Title
            </label>
            <input
              id="card-title-input"
              className="modal-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveDetails}
              placeholder="Card title…"
            />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="field-label">Status</label>
        <div className="status-picker">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              className={`status-chip${card.status === s.id ? ' active' : ''} st-${s.id}`}
              onClick={() => updateCard(card.id, { status: s.id as Status })}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="field-label">Log</label>
        <textarea
          className="text-area"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDetails}
          placeholder="Log notes, updates, context…"
          rows={3}
        />

        <div className="request-section">
          <div className="field-label-row">
            <span className="field-label">Request</span>
            {card.request && (
              <button className="link-btn" onClick={() => clearRequest(card.id)}>
                Withdraw
              </button>
            )}
          </div>

          {card.request ? (
            <div className="request-view">
              <div className="request-row">
                <UserBadge user={requester} role="Requester" showName />
                <span className="arrow">→</span>
                <UserBadge user={pic} role="PIC" showName />
              </div>
              {card.request.notes && <p className="request-notes">{card.request.notes}</p>}
            </div>
          ) : showRequestForm ? (
            <div className="request-form">
              <label className="field-label">PIC</label>
              <div className="pic-picker">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`pic-choice${picId === u.id ? ' selected' : ''}`}
                    style={
                      picId === u.id
                        ? { background: u.color, color: textOn(u.color), borderColor: u.color }
                        : { borderColor: u.color }
                    }
                    onClick={() => setPicId(u.id)}
                  >
                    <span className="dot" style={{ background: u.color }} />
                    {u.name}
                  </button>
                ))}
              </div>
              <textarea
                className="text-area"
                placeholder="Notes / context for this request…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
              <div className="row-actions">
                <button className="btn-primary" disabled={!picId} onClick={submit}>
                  Submit request
                </button>
                <button className="btn-ghost" onClick={() => setShowRequestForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-outline" onClick={() => setShowRequestForm(true)}>
              + Submit a request
            </button>
          )}
        </div>

        <div className="modal-footer">
          {confirmDelete ? (
            <div className="confirm-delete">
              <span>Delete this card? This can’t be undone.</span>
              <div className="row-actions">
                <button className="btn-danger" onClick={remove}>
                  Delete
                </button>
                <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="link-btn danger" onClick={() => setConfirmDelete(true)}>
              Delete card
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
