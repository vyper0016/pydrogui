import { useEffect, useState } from 'react'
import { apiFetchJson, type MemoryPage } from '../api'

const COLS = 16

function hexByte(n: number): string {
  return n.toString(16).padStart(2, '0')
}

function ascii(n: number): string {
  return n >= 0x20 && n <= 0x7e ? String.fromCharCode(n) : '.'
}

export function MemoryView({
  hasSession,
  refreshKey,
}: {
  hasSession: boolean
  refreshKey: number
}) {
  const [addrInput, setAddrInput] = useState('0x0')
  const [page, setPage] = useState<MemoryPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(addr: string) {
    if (!hasSession) return
    setLoading(true)
    setError('')
    try {
      const data = await apiFetchJson<MemoryPage>(
        `/read-memory-page/${encodeURIComponent(addr.trim())}`,
      )
      setPage(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Re-fetch the currently shown page when execution state changes.
  useEffect(() => {
    if (page) load(page.start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  function stepPage(dir: 1 | -1) {
    if (!page) return
    const next = Math.max(0, parseInt(page.start, 16) + dir * page.page_size)
    const addr = '0x' + next.toString(16)
    setAddrInput(addr)
    load(addr)
  }

  const base = page ? parseInt(page.start, 16) : 0
  const rows: number[][] = []
  if (page) {
    for (let i = 0; i < page.values.length; i += COLS) {
      rows.push(page.values.slice(i, i + COLS))
    }
  }

  return (
    <div className="mt-4 border border-gray-200 rounded bg-white">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="font-semibold text-sm text-gray-700">Memory</span>
        <div className="ml-auto flex items-center gap-1">
          <input
            type="text"
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(addrInput)}
            placeholder="0x0"
            className="w-32 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
          />
          <div className="flex flex-col leading-none">
            <button
              onClick={() => stepPage(1)}
              disabled={!page}
              title="next page"
              className="px-1 text-[9px] text-black hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent rounded-t cursor-pointer"
            >
              ▲
            </button>
            <button
              onClick={() => stepPage(-1)}
              disabled={!page}
              title="previous page"
              className="px-1 text-[9px] text-black hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent rounded-b cursor-pointer"
            >
              ▼
            </button>
          </div>
        </div>
        <button
          onClick={() => load(addrInput)}
          disabled={!hasSession}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 text-white font-semibold rounded cursor-pointer text-sm"
        >
          Go
        </button>
      </div>

      {error && <p className="px-3 py-2 text-sm text-red-600">Error: {error}</p>}

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
          {rows.map((row, r) => {
            const rowAddr = base + r * COLS
            return (
              <div
                key={r}
                className="grid grid-cols-[10ch_1fr_18ch] gap-3 px-3 py-0.5 text-gray-800 hover:bg-gray-50"
              >
                <span className="text-gray-500">
                  0x{rowAddr.toString(16).padStart(4, '0')}
                </span>
                <span className="text-gray-800 tracking-wider">
                  {row.map((b) => hexByte(b)).join(' ')}
                </span>
                <span className="text-gray-500 whitespace-pre">
                  {row.map((b) => ascii(b)).join('')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
