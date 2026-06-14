import { useEffect, useRef } from 'react'
import type { MemAccess } from '../api'
import { MEM_HISTORY_HEIGHT_KEY } from '../storage'

export type AccessEntry = MemAccess & { seq: number }

function isWrite(type: string): boolean {
  return type.toLowerCase().startsWith('w')
}

export function AccessHistory({
  history,
  onClear,
  onJumpToMemory,
}: {
  history: AccessEntry[]
  onClear: () => void
  onJumpToMemory: (addr: string) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Persist the user's chosen height, mirroring the disassembly view.
  useEffect(() => {
    const w = wrapperRef.current
    if (!w) return
    const saved = localStorage.getItem(MEM_HISTORY_HEIGHT_KEY)
    if (saved) w.style.height = `${parseInt(saved, 10)}px`
    const ro = new ResizeObserver(([entry]) => {
      localStorage.setItem(
        MEM_HISTORY_HEIGHT_KEY,
        String(Math.round(entry.contentRect.height)),
      )
    })
    ro.observe(w)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="mt-4 border border-gray-200 rounded bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="font-semibold text-sm text-gray-700">Access History</span>
        <div className="flex items-center gap-3 ml-auto text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-sky-200 border border-sky-300" />
            read
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-rose-200 border border-rose-300" />
            write
          </span>
          <button
            onClick={onClear}
            disabled={history.length === 0}
            className="px-2 py-0.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
          >
            clear
          </button>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className="resize-y overflow-hidden h-[30vh] min-h-[100px] max-h-[80vh]"
      >
        {history.length === 0 ? (
          <div className="text-xs text-gray-500 italic p-3">
            No memory accesses yet. Step the machine to record reads and writes.
          </div>
        ) : (
          <div className="font-mono text-xs overflow-auto h-full">
            <div className="sticky top-0 z-10 grid grid-cols-[6ch_8ch_1fr_6ch_1fr] gap-3 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wide">
              <span>step</span>
              <span>type</span>
              <span>address</span>
              <span>width</span>
              <span>value</span>
            </div>
            {history.map((a) => {
              const write = isWrite(a.type)
              return (
                <div
                  key={a.seq}
                  className={
                    'grid grid-cols-[6ch_8ch_1fr_6ch_1fr] gap-3 px-3 py-0.5 ' +
                    (write ? 'bg-rose-50 text-gray-800' : 'bg-sky-50 text-gray-800')
                  }
                >
                  <span className="text-gray-500">{a.step}</span>
                  <span className={write ? 'text-rose-700' : 'text-sky-700'}>
                    {write ? 'write' : 'read'}
                  </span>
                  <span className="flex items-start gap-1 min-w-0">
                    <button
                      onClick={() => onJumpToMemory(a.addr)}
                      title="inspect this address in memory"
                      className="shrink-0 px-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded cursor-pointer leading-none"
                    >
                      →
                    </button>
                    <span className="text-gray-700 break-all min-w-0">{a.addr}</span>
                  </span>
                  <span className="text-gray-500">{a.width}</span>
                  <span className="text-gray-700 break-all">
                    {a.value < 0 ? '-0x' : '0x'}
                    {Math.abs(a.value).toString(16)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
