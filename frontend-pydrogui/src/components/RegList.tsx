import { useState, useEffect, useRef } from 'react'
import { displayName, describe, type NameMode } from '../registers'
import type { RegMap, FlashMap } from '../regGroups'
import type { CommitResult } from '../api'

function EditableRegValue({
  reg,
  value,
  flashClass,
  flashKey,
  onCommit,
  onJumpToMemory,
}: {
  reg: string
  value: string
  flashClass: string
  flashKey: string | number
  onCommit: (reg: string, raw: string) => Promise<CommitResult>
  onJumpToMemory: (addr: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [popupError, setPopupError] = useState<string | null>(null)
  const popupTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) window.clearTimeout(popupTimeoutRef.current)
    }
  }, [])

  function showError(msg: string) {
    setPopupError(msg)
    if (popupTimeoutRef.current) window.clearTimeout(popupTimeoutRef.current)
    popupTimeoutRef.current = window.setTimeout(() => setPopupError(null), 4500)
  }

  async function commit() {
    if (busy) return
    if (draft === value) {
      setEditing(false)
      return
    }
    setBusy(true)
    const result = await onCommit(reg, draft)
    setBusy(false)
    setEditing(false)
    if (!result.ok) {
      setDraft(value)
      showError(result.error)
    }
  }

  if (editing) {
    return (
      <div className="relative">
        <input
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') {
              setDraft(value)
              setEditing(false)
            }
          }}
          className="text-gray-900 bg-white border border-blue-400 rounded px-1 -mx-1 w-full font-mono text-xs outline-none"
        />
      </div>
    )
  }

  return (
    <div className="relative flex items-start gap-1">
      <span
        key={flashKey}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={
          'text-gray-900 break-all px-1 -mx-1 cursor-text hover:bg-gray-100 rounded inline-block flex-1 min-w-0' +
          (flashClass ? ' ' + flashClass : '')
        }
      >
        {value || ' '}
      </span>
      {value && (
        <button
          onClick={() => onJumpToMemory(value)}
          title="inspect this address in memory"
          className="shrink-0 px-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded cursor-pointer leading-none"
        >
          →
        </button>
      )}
      {popupError && (
        <div
          onClick={() => setPopupError(null)}
          className="absolute z-20 right-0 top-full mt-1 max-w-[300px] px-2 py-1 bg-red-600 text-white text-xs rounded shadow-lg cursor-pointer break-words"
          title="click to dismiss"
        >
          {popupError}
        </div>
      )}
    </div>
  )
}

const FLASH_CLASS: Record<string, string> = {
  yellow: 'reg-flash',
  green: 'reg-flash-green',
  red: 'reg-flash-red',
}

export function RegList({
  regs,
  values,
  flash,
  nameMode,
  onCommit,
  onJumpToMemory,
}: {
  regs: string[]
  values: RegMap
  flash: FlashMap
  nameMode: NameMode
  onCommit: (reg: string, raw: string) => Promise<CommitResult>
  onJumpToMemory: (addr: string) => void
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
      {regs.map((r) => {
        const f = flash[r]
        const desc = describe(r)
        const flashClass = f ? FLASH_CLASS[f.kind] ?? '' : ''
        const flashKey: string | number = f ? `${f.kind}-${f.seq}` : 'idle'
        return (
          <div key={r} className="contents">
            <span className="text-gray-600 cursor-help" title={desc ?? r}>
              {displayName(r, nameMode)}
            </span>
            <EditableRegValue
              reg={r}
              value={values[r] ?? ''}
              flashClass={flashClass}
              flashKey={flashKey}
              onCommit={onCommit}
              onJumpToMemory={onJumpToMemory}
            />
          </div>
        )
      })}
    </div>
  )
}
