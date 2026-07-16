import { useState } from 'react'
import { PALETTE, textOn } from '../colors'
import { claimIdentity, switchUser, useBoard } from '../store'

/**
 * First-use identity picker. The user claims a unique color (their identity)
 * and attaches a name to it. Colors already claimed by active users are locked.
 */
export default function Onboarding() {
  const { users } = useBoard()
  const taken = new Set(users.map((u) => u.color))
  const firstFree = PALETTE.find((p) => !taken.has(p.hex))?.hex ?? PALETTE[0].hex
  const [color, setColor] = useState(firstFree)
  const [name, setName] = useState('')

  const canSubmit = name.trim().length > 0 && !taken.has(color)

  return (
    <div className="onboard-overlay">
      <div className="onboard-card">
        <h1>Pick your color</h1>
        <p className="onboard-sub">
          Your color is your identity on the board. Choose one, add your name.
        </p>

        <div className="swatch-grid">
          {PALETTE.map((p) => {
            const isTaken = taken.has(p.hex)
            const selected = color === p.hex
            return (
              <button
                key={p.hex}
                type="button"
                disabled={isTaken}
                className={`swatch-choice${selected ? ' selected' : ''}${isTaken ? ' taken' : ''}`}
                style={{ background: p.hex, color: textOn(p.hex) }}
                onClick={() => setColor(p.hex)}
                title={isTaken ? `${p.name} — taken` : p.name}
              >
                {selected ? '✓' : isTaken ? '×' : ''}
              </button>
            )
          })}
        </div>

        <input
          className="text-input"
          placeholder="Your name"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) claimIdentity(name, color)
          }}
          autoFocus
        />

        <button
          type="button"
          className="btn-primary"
          disabled={!canSubmit}
          onClick={() => claimIdentity(name, color)}
        >
          Join the board
        </button>

        {users.length > 0 && (
          <div className="onboard-existing">
            <div className="popover-label">Or continue as</div>
            <div className="existing-users">
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="existing-user"
                  onClick={() => switchUser(u.id)}
                >
                  <span className="dot" style={{ background: u.color }} />
                  {u.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
