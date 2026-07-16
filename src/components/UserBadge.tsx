import { useState, useRef, useEffect } from 'react'
import type { User } from '../types'
import { textOn } from '../colors'
import { openRequestsFor, userById } from '../store'

interface Props {
  user?: User
  /** Optional label shown next to the swatch, e.g. "Requester". */
  role?: string
  size?: 'sm' | 'md'
  /** Show the name inline instead of only on hover. */
  showName?: boolean
}

/**
 * A user's color swatch — the primary identity signal. Hover or click to
 * reveal a popover with the name and their open requests.
 */
export default function UserBadge({ user, role, size = 'md', showName = false }: Props) {
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const open = hovering || pinned

  useEffect(() => {
    if (!pinned) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pinned])

  if (!user) {
    return <span className="badge-empty" title={role ? `No ${role} yet` : 'Unassigned'} />
  }

  const requests = openRequestsFor(user.id)

  return (
    <span
      className={`badge badge-${size}`}
      ref={ref}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        className="swatch"
        style={{ background: user.color, color: textOn(user.color) }}
        onClick={(e) => {
          e.stopPropagation()
          setPinned((v) => !v)
        }}
        aria-label={user.name}
      >
        {user.name.slice(0, 1).toUpperCase()}
      </button>
      {showName && <span className="badge-name">{user.name}</span>}

      {open && (
        <div className="popover" onClick={(e) => e.stopPropagation()}>
          <div className="popover-head">
            <span
              className="dot"
              style={{ background: user.color }}
            />
            <strong>{user.name}</strong>
            {role && <span className="popover-role">{role}</span>}
          </div>
          <div className="popover-body">
            <div className="popover-label">Open requests ({requests.length})</div>
            {requests.length === 0 && <div className="popover-empty">None</div>}
            <ul>
              {requests.map((c) => {
                const asRequester = c.request?.requesterId === user.id
                const counterpartId = asRequester ? c.request?.picId : c.request?.requesterId
                const counterpart = userById(counterpartId)
                return (
                  <li key={c.id}>
                    <span className="req-title">{c.title}</span>
                    <span className="req-meta">
                      {asRequester ? 'requester' : 'PIC'}
                      {counterpart && (
                        <>
                          {' · '}
                          <span
                            className="mini-dot"
                            style={{ background: counterpart.color }}
                          />
                          {counterpart.name}
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </span>
  )
}
