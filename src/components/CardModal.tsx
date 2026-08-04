import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { Attachment, Card, Comment, Status, User } from '../types'
import { STATUSES } from '../types'
import { MULTI_PIC_COLOR, textOn } from '../colors'
import { formatShortDate, formatShortDateTime } from '../dates'
import {
  addComment,
  addLinkAttachment,
  archiveCard,
  attachmentsFor,
  clearRequest,
  commentsFor,
  deleteCard,
  removeAttachment,
  removeComment,
  restoreCard,
  setDueDate,
  submitRequest,
  updateCard,
  uploadFileAttachment,
  userById,
} from '../store'
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
  const [picIds, setPicIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Re-sync if the card changes under us (e.g. another user edits it via
  // realtime while this modal is open) so a blur-save can't clobber their
  // update with our stale local buffer.
  useEffect(() => {
    setTitle(card.title)
    setDescription(card.description)
  }, [card.title, card.description])

  const requester = userById(card.request?.requesterId)
  const pics = (card.request?.picIds ?? []).map(userById).filter((u): u is User => Boolean(u))

  const saveDetails = () => updateCard(card.id, { title, description })

  const togglePic = (id: string) => {
    setPicIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const submit = () => {
    if (picIds.length === 0) return
    submitRequest(card.id, currentUser.id, picIds, notes)
    setShowRequestForm(false)
    setPicIds([])
    setNotes('')
  }

  const remove = () => {
    deleteCard(card.id)
    onClose()
  }

  const attachments = attachmentsFor(card.id)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setUploading(true)
    setAttachmentError('')
    const { error } = await uploadFileAttachment(card.id, file, currentUser.id)
    setUploading(false)
    if (error) setAttachmentError(error)
  }

  const submitLink = async () => {
    const { error } = await addLinkAttachment(card.id, linkUrl, linkLabel, currentUser.id)
    if (error) {
      setAttachmentError(error)
      return
    }
    setShowLinkForm(false)
    setLinkUrl('')
    setLinkLabel('')
    setAttachmentError('')
  }

  const comments = commentsFor(card.id)

  const submitComment = async () => {
    const { error } = await addComment(card.id, currentUser.id, commentBody)
    if (error) {
      setCommentError(error)
      return
    }
    setCommentBody('')
    setCommentError('')
  }

  return (
    <>
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

        <label className="field-label" htmlFor="card-due-date">
          Due date
        </label>
        <div className="due-date-row">
          <input
            id="card-due-date"
            type="date"
            className="due-date-input"
            value={card.dueDate ?? ''}
            onChange={(e) => setDueDate(card.id, e.target.value || null)}
          />
          {card.dueDate && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setDueDate(card.id, null)}
              title="Clear due date"
            >
              Clear
            </button>
          )}
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

        <div className="attachments-section">
          <span className="field-label">Attachments</span>

          {attachments.length > 0 && (
            <ul className="attachment-list">
              {attachments.map((a) => (
                <AttachmentRow
                  key={a.id}
                  attachment={a}
                  onRemove={() => removeAttachment(a)}
                  onPreview={() => setPreviewAttachment(a)}
                />
              ))}
            </ul>
          )}

          {attachmentError && <div className="attachment-error">{attachmentError}</div>}

          {showLinkForm ? (
            <div className="link-form">
              <input
                className="text-input"
                placeholder="https://…"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                autoFocus
              />
              <input
                className="text-input"
                placeholder="Label (optional)"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitLink()}
              />
              <div className="row-actions">
                <button className="btn-primary" disabled={!linkUrl.trim()} onClick={submitLink}>
                  Add link
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setShowLinkForm(false)
                    setAttachmentError('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="attachment-actions">
              <button
                type="button"
                className="btn-outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : '+ Add file'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowLinkForm(true)}>
                + Add link
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="visually-hidden"
                onChange={handleFileChange}
              />
            </div>
          )}
        </div>

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
                {pics.length > 0 ? (
                  <span
                    className={`pic-group${pics.length > 1 ? ' multi' : ''}`}
                    title={pics.length > 1 ? `${pics.length} PICs assigned` : undefined}
                  >
                    {pics.map((p) => (
                      <UserBadge key={p.id} user={p} role="PIC" showName />
                    ))}
                  </span>
                ) : (
                  <UserBadge role="PIC" showName />
                )}
              </div>
              <p className="request-meta">Requested on {formatShortDate(card.request.createdAt)}</p>
              {card.request.notes && <p className="request-notes">{card.request.notes}</p>}
            </div>
          ) : showRequestForm ? (
            <div className="request-form">
              <label className="field-label">PIC{picIds.length > 1 ? 's' : ''}</label>
              <div className="pic-picker">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`pic-choice${picIds.includes(u.id) ? ' selected' : ''}`}
                    style={
                      picIds.includes(u.id)
                        ? { background: u.color, color: textOn(u.color), borderColor: u.color }
                        : { borderColor: u.color }
                    }
                    onClick={() => togglePic(u.id)}
                  >
                    <span className="dot" style={{ background: u.color }} />
                    {u.name}
                  </button>
                ))}
              </div>
              {picIds.length > 1 && (
                <p className="pic-multi-hint">
                  <span className="dot" style={{ background: MULTI_PIC_COLOR }} />
                  Shown as shared (yellow) on the board with {picIds.length} PICs assigned.
                </p>
              )}
              <textarea
                className="text-area"
                placeholder="Notes / context for this request…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
              <div className="row-actions">
                <button className="btn-primary" disabled={picIds.length === 0} onClick={submit}>
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

        <div className="comments-section">
          <span className="field-label">Comments</span>

          {comments.length > 0 && (
            <ul className="comment-list">
              {comments.map((c) => (
                <CommentRow key={c.id} comment={c} onRemove={() => removeComment(c)} />
              ))}
            </ul>
          )}

          {commentError && <div className="attachment-error">{commentError}</div>}

          <div className="comment-form">
            <textarea
              className="text-area"
              placeholder="Write a comment…"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={2}
            />
            <div className="row-actions">
              <button className="btn-primary" disabled={!commentBody.trim()} onClick={submitComment}>
                Post comment
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {card.archivedAt ? (
            <div className="archive-status">
              <span>Archived on {formatShortDate(card.archivedAt)}</span>
              <button type="button" className="link-btn" onClick={() => restoreCard(card.id)}>
                Restore to board
              </button>
            </div>
          ) : (
            card.status === 'done' && (
              <button type="button" className="btn-outline archive-btn" onClick={() => archiveCard(card.id)}>
                Move to History
              </button>
            )
          )}

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

    {previewAttachment && (
      <div className="lightbox-overlay" onMouseDown={() => setPreviewAttachment(null)}>
        <div className="lightbox-content" onMouseDown={(e) => e.stopPropagation()}>
          <button
            className="icon-btn lightbox-close"
            onClick={() => setPreviewAttachment(null)}
            aria-label="Close preview"
          >
            ×
          </button>
          <img className="lightbox-image" src={previewAttachment.url} alt={previewAttachment.name} />
          <div className="lightbox-caption">{previewAttachment.name}</div>
        </div>
      </div>
    )}
    </>
  )
}

function AttachmentRow({
  attachment,
  onRemove,
  onPreview,
}: {
  attachment: Attachment
  onRemove: () => void
  onPreview: () => void
}) {
  const addedBy = userById(attachment.addedBy)
  const isImage = attachment.kind === 'file' && (attachment.mimeType ?? '').startsWith('image/')
  const content = isImage ? (
    <img className="attachment-thumb" src={attachment.url} alt="" />
  ) : (
    <span className="attachment-icon" aria-hidden="true">
      {attachment.kind === 'link' ? '🔗' : '📄'}
    </span>
  )
  return (
    <li className="attachment-row">
      {isImage ? (
        <button type="button" className="attachment-link" onClick={onPreview} title={attachment.name}>
          {content}
          <span className="attachment-name">{attachment.name}</span>
        </button>
      ) : (
        <a
          className="attachment-link"
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          title={attachment.name}
        >
          {content}
          <span className="attachment-name">{attachment.name}</span>
        </a>
      )}
      <UserBadge user={addedBy} role="Added by" size="sm" />
      <button className="icon-btn attachment-remove" onClick={onRemove} aria-label="Remove attachment">
        ×
      </button>
    </li>
  )
}

function CommentRow({ comment, onRemove }: { comment: Comment; onRemove: () => void }) {
  const author = userById(comment.authorId)
  return (
    <li className="comment-row">
      <UserBadge user={author} size="sm" />
      <div className="comment-body-wrap">
        <div className="comment-meta">
          <span className="comment-author">{author?.name ?? 'Removed user'}</span>
          <span className="comment-time">{formatShortDateTime(comment.createdAt)}</span>
        </div>
        <p className="comment-body">{comment.body}</p>
      </div>
      <button className="icon-btn comment-remove" onClick={onRemove} aria-label="Remove comment">
        ×
      </button>
    </li>
  )
}
