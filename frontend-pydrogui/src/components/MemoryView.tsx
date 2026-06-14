import { useEffect, useMemo, useRef, useState } from 'react'
import {
  apiFetchJson,
  setMemoryPageSize,
  writeMemory,
  type MemoryPage,
  type MemAccess,
} from '../api'
import { MEM_ADDR_KEY, MEM_COLS_KEY, MEM_ROWS_KEY } from '../storage'

function readCount(key: string, fallback: number): number {
  const n = parseInt(localStorage.getItem(key) ?? '', 10)
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

function hexByte(n: number): string {
  return n.toString(16).padStart(2, '0')
}

function ascii(n: number): string {
  return n >= 0x20 && n <= 0x7e ? String.fromCharCode(n) : '.'
}

export function MemoryView({
  hasSession,
  refreshKey,
  jump,
  accessFlash,
}: {
  hasSession: boolean
  refreshKey: number
  jump: { addr: string; seq: number; width: number; cls: string } | null
  accessFlash: { seq: number; accesses: MemAccess[] } | null
}) {
  const [addrInput, setAddrInput] = useState(
    () => localStorage.getItem(MEM_ADDR_KEY) ?? '0x0',
  )
  const [page, setPage] = useState<MemoryPage | null>(null)
  const [cols, setCols] = useState(() => readCount(MEM_COLS_KEY, 16))
  const [rows, setRows] = useState(() => readCount(MEM_ROWS_KEY, 16))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addrFocused, setAddrFocused] = useState(false)
  // Byte range to flash (jump = yellow/read/write color, write ok = green, write error = red).
  const [flashByte, setFlashByte] = useState<
    { addr: number; width: number; seq: number; cls: string } | null
  >(null)
  const flashSeqRef = useRef(0)
  // Inline single-byte edit: index into the current page, plus its draft hex.
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // Transient inline-edit error popup, and header write ok/error toast.
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [headerMsg, setHeaderMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const inlineTimer = useRef<number | null>(null)
  const headerTimer = useRef<number | null>(null)

  function showInlineError(msg: string) {
    setInlineError(msg)
    if (inlineTimer.current) window.clearTimeout(inlineTimer.current)
    inlineTimer.current = window.setTimeout(() => setInlineError(null), 4500)
  }

  function showHeaderMsg(ok: boolean, text: string) {
    setHeaderMsg({ ok, text })
    if (headerTimer.current) window.clearTimeout(headerTimer.current)
    headerTimer.current = window.setTimeout(() => setHeaderMsg(null), 3000)
  }

  useEffect(() => {
    return () => {
      if (inlineTimer.current) window.clearTimeout(inlineTimer.current)
      if (headerTimer.current) window.clearTimeout(headerTimer.current)
    }
  }, [])
  // Header write form for wide / off-screen writes.
  const [wAddr, setWAddr] = useState('')
  const [wValue, setWValue] = useState('')
  const [wWidth, setWWidth] = useState(8)

  // Refs let press-and-hold ticks compound without waiting on async state.
  const addrNumRef = useRef(parseInt(addrInput, 16) || 0)
  const stepRef = useRef(256)
  const reqSeqRef = useRef(0)
  const holdRef = useRef<number | null>(null)
  const holdDelayRef = useRef<number | null>(null)

  async function load(addr: string) {
    if (!hasSession) return
    const seq = ++reqSeqRef.current
    setLoading(true)
    setError('')
    try {
      const data = await apiFetchJson<MemoryPage>(
        `/read-memory-page/${encodeURIComponent(addr.trim())}`,
      )
      if (seq !== reqSeqRef.current) return // stale response, newer request in flight
      setPage(data)
      addrNumRef.current = parseInt(data.start, 16)
      stepRef.current = data.page_size
      localStorage.setItem(MEM_ADDR_KEY, data.start)
    } catch (err) {
      if (seq === reqSeqRef.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (seq === reqSeqRef.current) setLoading(false)
    }
  }

  // Re-fetch the currently shown page when execution state changes.
  useEffect(() => {
    if (page) load(page.start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // On session start, push stored geometry then load the stored address;
  // on session end, clear the view.
  useEffect(() => {
    if (!hasSession) {
      setPage(null)
      return
    }
    ;(async () => {
      try {
        await setMemoryPageSize(cols * rows)
      } catch {
        // server may reject; load anyway with whatever size it has
      }
      load(addrInput)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession])

  // Jump to an address copied from a register.
  useEffect(() => {
    if (!jump) return
    setAddrInput(jump.addr)
    const target = parseInt(jump.addr, 16)
    if (Number.isFinite(target))
      setFlashByte({
        addr: target,
        width: Math.max(1, jump.width),
        seq: ++flashSeqRef.current,
        cls: jump.cls,
      })
    load(jump.addr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.seq])

  function stepPage(dir: 1 | -1) {
    if (!hasSession) return
    const next = Math.max(0, addrNumRef.current + dir * stepRef.current)
    addrNumRef.current = next
    const addr = '0x' + next.toString(16)
    setAddrInput(addr)
    load(addr)
  }

  function startHold(dir: 1 | -1) {
    if (!page || holdRef.current !== null || holdDelayRef.current !== null) return
    stepPage(dir) // immediate first step
    // Start fast repeat only after the button is held for 1s.
    holdDelayRef.current = window.setTimeout(() => {
      holdDelayRef.current = null
      holdRef.current = window.setInterval(() => stepPage(dir), 120)
    }, 1000)
  }

  function stopHold() {
    if (holdDelayRef.current !== null) {
      window.clearTimeout(holdDelayRef.current)
      holdDelayRef.current = null
    }
    if (holdRef.current !== null) {
      window.clearInterval(holdRef.current)
      holdRef.current = null
    }
  }

  // Clear any running hold interval on unmount.
  useEffect(() => stopHold, [])

  async function applyGeometry(nextCols: number, nextRows: number) {
    setCols(nextCols)
    setRows(nextRows)
    if (Number.isFinite(nextCols) && nextCols >= 1) {
      localStorage.setItem(MEM_COLS_KEY, String(nextCols))
    }
    if (Number.isFinite(nextRows) && nextRows >= 1) {
      localStorage.setItem(MEM_ROWS_KEY, String(nextRows))
    }
    if (!hasSession || nextCols < 1 || nextRows < 1) return
    try {
      await setMemoryPageSize(nextCols * nextRows)
      load(page ? page.start : addrInput)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Write one byte at the given page index from the inline editor draft.
  async function commitByte(idx: number) {
    if (!page) return
    const raw = editDraft.trim()
    const cur = page.values[idx]
    if (raw === '' || raw === hexByte(cur)) {
      setEditIdx(null)
      return
    }
    const parsed = parseInt(raw, 16)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xff) {
      setEditIdx(null)
      setFlashByte({ addr: base + idx, width: 1, seq: ++flashSeqRef.current, cls: 'reg-flash-red' })
      showInlineError(`Invalid byte: ${raw}`)
      return
    }
    setBusy(true)
    try {
      await writeMemory('0x' + (base + idx).toString(16), '0x' + parsed.toString(16), 1)
      setEditIdx(null)
      await load(page.start)
      setFlashByte({ addr: base + idx, width: 1, seq: ++flashSeqRef.current, cls: 'reg-flash-green' })
    } catch (err) {
      setEditIdx(null)
      setFlashByte({ addr: base + idx, width: 1, seq: ++flashSeqRef.current, cls: 'reg-flash-red' })
      showInlineError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Header form write: arbitrary address, value, and width.
  async function commitWrite() {
    if (!hasSession || busy) return
    const addr = wAddr.trim()
    const value = wValue.trim()
    if (!addr || !value) {
      showHeaderMsg(false, 'need address + value')
      return
    }
    setBusy(true)
    try {
      await writeMemory(addr, value, wWidth)
      setWValue('')
      await load(page ? page.start : addrInput)
      showHeaderMsg(true, 'ok')
    } catch (err) {
      showHeaderMsg(false, err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Map each accessed byte from the last step to its kind, for color-coded flashing.
  const accessMap = useMemo(() => {
    const m = new Map<number, 'read' | 'write'>()
    if (accessFlash) {
      for (const a of accessFlash.accesses) {
        const start = parseInt(a.addr, 16)
        if (!Number.isFinite(start)) continue
        const kind = a.type.toLowerCase().startsWith('w') ? 'write' : 'read'
        for (let i = 0; i < a.width; i++) m.set(start + i, kind)
      }
    }
    return m
  }, [accessFlash])
  const accessSeq = accessFlash?.seq

  const base = page ? parseInt(page.start, 16) : 0
  const gridRows: number[][] = []
  if (page) {
    for (let i = 0; i < page.values.length; i += cols) {
      gridRows.push(page.values.slice(i, i + cols))
    }
  }

  // While the address box is focused, highlight the byte at that exact address.
  const target = parseInt(addrInput, 16)
  const highlightIdx =
    addrFocused && page && Number.isFinite(target) &&
    target >= base && target < base + page.values.length
      ? target - base
      : -1

  return (
    <div className="mt-4 border border-gray-200 rounded bg-white relative">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="font-semibold text-sm text-gray-700">Memory</span>
        <label className="flex items-center gap-1 text-xs text-gray-400">
          cols
          <input
            type="number"
            min={1}
            value={cols}
            onChange={(e) => applyGeometry(Number(e.target.value), rows)}
            className="w-14 px-1 py-0.5 border border-gray-200 rounded text-xs font-mono text-gray-500"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-400">
          rows
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => applyGeometry(cols, Number(e.target.value))}
            className="w-14 px-1 py-0.5 border border-gray-200 rounded text-xs font-mono text-gray-500"
          />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <input
            type="text"
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value)}
            onFocus={() => setAddrFocused(true)}
            onBlur={() => setAddrFocused(false)}
            onKeyDown={(e) => e.key === 'Enter' && load(addrInput)}
            placeholder="0x0"
            className="w-32 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
          />
          <div className="flex flex-col leading-none">
            <button
              onMouseDown={() => startHold(1)}
              onMouseUp={stopHold}
              onMouseLeave={stopHold}
              onTouchStart={(e) => { e.preventDefault(); startHold(1) }}
              onTouchEnd={stopHold}
              disabled={!page}
              title="next page (hold to scroll)"
              className="px-1 text-[9px] text-black hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent rounded-t cursor-pointer select-none"
            >
              ▲
            </button>
            <button
              onMouseDown={() => startHold(-1)}
              onMouseUp={stopHold}
              onMouseLeave={stopHold}
              onTouchStart={(e) => { e.preventDefault(); startHold(-1) }}
              onTouchEnd={stopHold}
              disabled={!page}
              title="previous page (hold to scroll)"
              className="px-1 text-[9px] text-black hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent rounded-b cursor-pointer select-none"
            >
              ▼
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 text-xs text-gray-400">
        <span className="text-gray-500">write</span>
        <input
          type="text"
          value={wAddr}
          onChange={(e) => setWAddr(e.target.value)}
          placeholder="address"
          className="w-28 px-2 py-1 border border-gray-300 rounded font-mono text-gray-700"
        />
        <input
          type="text"
          value={wValue}
          onChange={(e) => setWValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commitWrite()}
          placeholder="value"
          title="hex (0x…) or decimal"
          className="w-28 px-2 py-1 border border-gray-300 rounded font-mono text-gray-700"
        />
        <label className="flex items-center gap-1">
          width
          <select
            value={wWidth}
            onChange={(e) => setWWidth(Number(e.target.value))}
            className="px-1 py-1 border border-gray-300 rounded font-mono text-gray-700"
          >
            {[1, 2, 4, 8].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </label>
        <button
          onClick={commitWrite}
          disabled={!hasSession || busy}
          className="px-2 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
        >
          write
        </button>
        {headerMsg && (
          <span
            className={
              'font-mono ' + (headerMsg.ok ? 'text-green-600' : 'text-red-600')
            }
          >
            {headerMsg.text}
          </span>
        )}
      </div>

      {error && <p className="px-3 py-2 text-sm text-red-600">Error: {error}</p>}

      {inlineError && (
        <div
          onClick={() => setInlineError(null)}
          title="click to dismiss"
          className="absolute z-30 right-3 top-12 max-w-[300px] px-2 py-1 bg-red-600 text-white text-xs rounded shadow-lg cursor-pointer break-words"
        >
          {inlineError}
        </div>
      )}

      {loading && !page ? (
        <div className="text-xs text-gray-500 italic p-3">Loading memory…</div>
      ) : !page ? (
        <div className="text-xs text-gray-500 italic p-3">
          Enter an address to inspect a memory page.
        </div>
      ) : (
        <div className="font-mono text-xs overflow-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[10ch_1fr_18ch] gap-3 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wide">
            <span>address</span>
            <span>bytes</span>
            <span>ascii</span>
          </div>
          {gridRows.map((row, r) => {
            const rowAddr = base + r * cols
            return (
              <div
                key={r}
                className="grid grid-cols-[10ch_1fr_18ch] gap-3 px-3 py-0.5 text-gray-800 hover:bg-gray-50"
              >
                <span className="text-gray-500">
                  0x{rowAddr.toString(16).padStart(4, '0')}
                </span>
                <span className="text-gray-800">
                  {row.map((b, c) => {
                    const idx = r * cols + c
                    const hot = idx === highlightIdx
                    if (idx === editIdx) {
                      return (
                        <input
                          key={c}
                          autoFocus
                          value={editDraft}
                          disabled={busy}
                          maxLength={2}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onBlur={() => commitByte(idx)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitByte(idx)
                            else if (e.key === 'Escape') setEditIdx(null)
                          }}
                          className="w-[2.5ch] text-center bg-white border border-blue-400 rounded text-gray-900 outline-none mx-0.5 font-mono"
                        />
                      )
                    }
                    const flash =
                      flashByte !== null &&
                      base + idx >= flashByte.addr &&
                      base + idx < flashByte.addr + flashByte.width
                    const acc = accessMap.get(base + idx)
                    const key = flash
                      ? `${c}-j${flashByte.seq}`
                      : acc
                        ? `${c}-a${accessSeq}`
                        : c
                    return (
                      <span
                        key={key}
                        onClick={() => {
                          setEditDraft(hexByte(b))
                          setEditIdx(idx)
                        }}
                        title="click to edit byte"
                        className={
                          'px-0.5 rounded cursor-text hover:bg-gray-200 ' +
                          (hot
                            ? 'bg-yellow-300 text-gray-900'
                            : flash
                              ? flashByte.cls
                              : acc === 'write'
                                ? 'mem-flash-write'
                                : acc === 'read'
                                  ? 'mem-flash-read'
                                  : '')
                        }
                      >
                        {hexByte(b)}
                      </span>
                    )
                  })}
                </span>
                <span className="text-gray-500 whitespace-pre">
                  {row.map((b, c) => {
                    const idx = r * cols + c
                    const hot = idx === highlightIdx
                    const flash =
                      flashByte !== null &&
                      base + idx >= flashByte.addr &&
                      base + idx < flashByte.addr + flashByte.width
                    const acc = accessMap.get(base + idx)
                    const key = flash
                      ? `${c}-j${flashByte.seq}`
                      : acc
                        ? `${c}-a${accessSeq}`
                        : c
                    return (
                      <span
                        key={key}
                        className={
                          hot
                            ? 'bg-yellow-300 text-gray-900 rounded'
                            : flash
                              ? flashByte.cls
                              : acc === 'write'
                                ? 'mem-flash-write'
                                : acc === 'read'
                                  ? 'mem-flash-read'
                                  : ''
                        }
                      >
                        {ascii(b)}
                      </span>
                    )
                  })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
